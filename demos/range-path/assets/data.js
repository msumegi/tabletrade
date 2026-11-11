/* LearnHere data access. The only script that may touch localStorage.
   Swap createLocalAdapter for an API adapter later. See the demo README. */
(function (global) {
  "use strict";

  var STORAGE_KEY = "learnhere.store";
  var LEGACY_KEY = "rangepath.store";

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyStore() {
    return {
      organizations: {},
      users: {},
      classes: {},
      enrollments: {},
      progress: {},
      certificates: {},
      subscriptions: {},
      invoices: {},
      courseAssignments: {},
      seatUsage: {},
      session: { userId: "user-demo-learner" }
    };
  }

  function indexById(list) {
    var out = {};
    (list || []).forEach(function (item) {
      if (item && item.id) out[item.id] = item;
    });
    return out;
  }

  function progressKey(learnerId, courseId, itemId) {
    return learnerId + "|" + courseId + "|" + itemId;
  }

  function seedFromWindow() {
    var seed = global.LEARNHERE_SEED || global.RANGE_PATH_SEED;
    if (!seed) return emptyStore();
    return {
      organizations: indexById(seed.organizations),
      users: indexById(seed.users),
      classes: indexById(seed.classes),
      enrollments: indexById(seed.enrollments),
      progress: indexById(seed.progress),
      certificates: indexById(seed.certificates),
      subscriptions: indexById(seed.subscriptions),
      invoices: indexById(seed.invoices),
      courseAssignments: indexById(seed.courseAssignments),
      seatUsage: indexById(seed.seatUsage),
      session: { userId: "user-demo-learner" }
    };
  }

  function createLocalAdapter() {
    var memory = null;
    var storageOk = true;

    function read() {
      if (memory) return memory;
      var stored = null;
      try {
        stored = global.localStorage.getItem(STORAGE_KEY) || global.localStorage.getItem(LEGACY_KEY);
      } catch (err) {
        storageOk = false;
      }
      if (stored) {
        try {
          memory = JSON.parse(stored);
        } catch (err) {
          memory = null;
        }
      }
      if (!memory || !memory.users) memory = seedFromWindow();
      if (!memory.session) memory.session = { userId: "user-demo-learner" };
      var seed = seedFromWindow();
      if (!memory.subscriptions) memory.subscriptions = seed.subscriptions || {};
      if (!memory.invoices) memory.invoices = seed.invoices || {};
      if (!memory.courseAssignments) memory.courseAssignments = seed.courseAssignments || {};
      if (!memory.seatUsage) memory.seatUsage = seed.seatUsage || {};
      Object.keys(seed.organizations || {}).forEach(function (id) {
        if (!memory.organizations[id]) memory.organizations[id] = seed.organizations[id];
        else if (!memory.organizations[id].accessState && seed.organizations[id]) {
          memory.organizations[id].accessState = seed.organizations[id].accessState || "active";
        }
      });
      return memory;
    }

    function write() {
      memory = read();
      try {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
        storageOk = true;
      } catch (err) {
        storageOk = false;
      }
      return storageOk;
    }

    function getSessionUser() {
      var store = read();
      return store.users[store.session.userId] || store.users["user-demo-learner"] || null;
    }

    function setSession(userId) {
      var store = read();
      if (!store.users[userId]) return null;
      store.session.userId = userId;
      write();
      return store.users[userId];
    }

    function getUser(id) {
      return read().users[id] || null;
    }

    function updateUser(id, patch) {
      var store = read();
      if (!store.users[id]) return null;
      if (patch && patch.role === "org-admin") {
        var orgId = patch.orgId || store.users[id].orgId;
        var taken = Object.keys(store.users).some(function (otherId) {
          var other = store.users[otherId];
          return otherId !== id && other.orgId === orgId && other.role === "org-admin";
        });
        if (taken) return null;
      }
      Object.keys(patch || {}).forEach(function (key) {
        store.users[id][key] = patch[key];
      });
      write();
      return store.users[id];
    }

    function getOrg(id) {
      return read().organizations[id] || null;
    }

    function currentPeriod(org) {
      var sub = null;
      Object.keys(read().subscriptions || {}).forEach(function (id) {
        var row = read().subscriptions[id];
        if (org && row.orgId === org.id) sub = row;
      });
      if (sub && sub.currentPeriodStart && sub.currentPeriodEnd) {
        return { from: sub.currentPeriodStart, to: sub.currentPeriodEnd };
      }
      var month = nowIso().slice(0, 7);
      return { from: month + "-01T00:00:00.000Z", to: month + "-31T23:59:59.999Z" };
    }

    function canAccess(user, course) {
      var courseId = course && (course.id || course.slug);
      if (!user || !courseId) {
        return { allowed: false, reason: "There is no learner for this course in the demo.", accessState: "invited" };
      }
      if (user.role === "platform-owner") {
        return { allowed: true, reason: "", accessState: "active" };
      }
      var org = user.orgId ? getOrg(user.orgId) : null;
      var state = (org && org.accessState) || "active";
      if (state === "invited") {
        return { allowed: false, reason: "This program has not started yet.", accessState: state };
      }
      if (state === "cancelled") {
        return { allowed: false, reason: "This council's subscription has ended. A certificate that was already issued can still be opened.", accessState: state };
      }
      if (state === "restricted") {
        var started = listProgress(user.id, courseId).length > 0 || listEnrollments({ learnerId: user.id, courseId: courseId }).some(function (row) {
          return row.status === "in_progress" || row.status === "completed";
        });
        if (user.role !== "learner" || started) {
          return { allowed: true, reason: "New courses are paused until the subscription is sorted out. A course already started stays open.", accessState: state };
        }
        return { allowed: false, reason: "New courses are paused until the subscription is sorted out. Ask council staff.", accessState: state };
      }
      if (org && typeof org.seatCap === "number" && user.role === "learner") {
        var period = currentPeriod(org);
        var already = listEnrollments({ learnerId: user.id, orgId: org.id }).some(function (row) {
          return courseWasStarted(row) && inRange(row.startedAt, period.from, period.to);
        });
        if (!already && countActiveSeats(org.id, period.from, period.to) >= org.seatCap) {
          return { allowed: false, reason: "This council has reached its optional seat cap. Ask staff.", accessState: state };
        }
      }
      return { allowed: true, reason: "", accessState: state };
    }

    function setAccessState(orgId, accessState) {
      var allowed = { invited: "incomplete", active: "active", past_due_grace: "past_due", restricted: "past_due", cancelled: "canceled" };
      if (!allowed[accessState]) return null;
      var store = read();
      if (!store.organizations[orgId]) return null;
      store.organizations[orgId].accessState = accessState;
      Object.keys(store.subscriptions || {}).forEach(function (id) {
        if (store.subscriptions[id].orgId === orgId) store.subscriptions[id].providerStatus = allowed[accessState];
      });
      write();
      return store.organizations[orgId];
    }

    function scopedOrgId(requested) {
      var user = getSessionUser();
      if (!user) return null;
      if (user.role === "platform-owner") return requested || null;
      if (user.role === "org-admin" || user.role === "org-staff") {
        if (requested && requested !== user.orgId) return null;
        return user.orgId;
      }
      return null;
    }

    function listEnrollments(filter) {
      var query = filter || {};
      return Object.keys(read().enrollments).map(function (id) {
        return read().enrollments[id];
      }).filter(function (row) {
        if (query.orgId && row.orgId !== query.orgId) return false;
        if (query.learnerId && row.learnerId !== query.learnerId) return false;
        if (query.courseId && row.courseId !== query.courseId) return false;
        if (query.status && row.status !== query.status) return false;
        return true;
      });
    }

    function saveEnrollment(enrollment) {
      var store = read();
      var row = clone(enrollment);
      if (!row.id) row.id = "enr-" + row.learnerId + "-" + row.courseId;
      if (!row.startedAt) row.startedAt = nowIso();
      if (!row.status) row.status = "active";
      store.enrollments[row.id] = row;
      write();
      return row;
    }

    function openClassId(orgId) {
      var today = nowIso().slice(0, 10);
      var found = "";
      Object.keys(read().classes).forEach(function (id) {
        var row = read().classes[id];
        if (found || row.orgId !== orgId) return;
        if (row.endsOn && row.endsOn < today) return;
        found = row.id;
      });
      return found;
    }

    function ensureEnrollment(learnerId, courseId) {
      var user = getUser(learnerId);
      if (!user || !user.orgId) return null;
      var existing = listEnrollments({ learnerId: learnerId, courseId: courseId, orgId: user.orgId })[0];
      if (existing) return existing;
      return saveEnrollment({
        learnerId: learnerId,
        courseId: courseId,
        orgId: user.orgId,
        classId: openClassId(user.orgId),
        status: "in_progress"
      });
    }

    function listProgress(learnerId, courseId) {
      return Object.keys(read().progress).map(function (id) {
        return read().progress[id];
      }).filter(function (row) {
        if (learnerId && row.learnerId !== learnerId) return false;
        if (courseId && row.courseId !== courseId) return false;
        return true;
      });
    }

    function getProgress(learnerId, courseId) {
      var view = { lessons: {}, final: null };
      listProgress(learnerId, courseId).forEach(function (row) {
        var item = row.itemId || "";
        if (item.indexOf("quiz:") === 0) {
          var n = item.slice(5);
          view.lessons[n] = view.lessons[n] || {};
          view.lessons[n].correct = row.detail && row.detail.correct;
          view.lessons[n].total = row.detail && row.detail.total;
          view.lessons[n].percent = row.detail && row.detail.percent;
          view.lessons[n].done = row.status === "done" || (row.detail && row.detail.done);
          view.lessons[n].quizAt = row.at;
        } else if (item.indexOf("section:") === 0) {
          var bits = item.split(":");
          var lessonNo = bits[1];
          var sectionId = bits.slice(2).join(":");
          view.lessons[lessonNo] = view.lessons[lessonNo] || {};
          view.lessons[lessonNo].sections = view.lessons[lessonNo].sections || {};
          view.lessons[lessonNo].sections[sectionId] = row.at || true;
        } else if (item.indexOf("assignment:") === 0) {
          var assignBits = item.split(":");
          var assignLesson = assignBits[1];
          view.lessons[assignLesson] = view.lessons[assignLesson] || {};
          view.lessons[assignLesson].assignment = row.status === "done";
          view.lessons[assignLesson].assignmentAt = row.at;
        } else if (item === "exam:final") {
          view.final = {
            correct: row.detail && row.detail.correct,
            total: row.detail && row.detail.total,
            percent: row.detail && row.detail.percent,
            passed: Boolean(row.detail && row.detail.passed) || row.status === "passed",
            date: (row.detail && row.detail.date) || (row.at || "").slice(0, 10),
            at: row.at,
            attempts: (row.detail && row.detail.attempts) || []
          };
        }
      });
      return view;
    }

    function resetExamAttempts(learnerId, courseId) {
      var store = read();
      Object.keys(store.progress).forEach(function (id) {
        var row = store.progress[id];
        if (row.learnerId !== learnerId || row.courseId !== courseId) return;
        if (row.itemId === "exam:final" || String(row.itemId).indexOf("exam:attempt:") === 0) delete store.progress[id];
      });
      Object.keys(store.certificates).forEach(function (id) {
        var row = store.certificates[id];
        if (row.learnerId === learnerId && row.courseId === courseId) delete store.certificates[id];
      });
      write();
    }

    function listExamLocks(orgId) {
      var locks = [];
      listProgress().forEach(function (row) {
        if (row.itemId !== "exam:final") return;
        var person = getUser(row.learnerId);
        if (!person || person.orgId !== orgId) return;
        var attempts = (row.detail && row.detail.attempts) || [];
        var limit = examAttemptLimit(row.courseId);
        if (row.detail && row.detail.passed) return;
        if (attempts.length < limit) return;
        locks.push({
          learnerId: row.learnerId,
          learnerName: person.name,
          learnerCode: person.learnerCode || "",
          courseId: row.courseId,
          attempts: attempts.length,
          limit: limit
        });
      });
      return locks;
    }

    function examAttemptLimit(courseId) {
      var catalogue = global.LEARNHERE || global.RANGE_PATH;
      var courses = catalogue && catalogue.courses ? catalogue.courses : [];
      for (var i = 0; i < courses.length; i++) {
        if (courses[i].id === courseId && courses[i].plan && courses[i].plan.attemptLimit) {
          return courses[i].plan.attemptLimit;
        }
      }
      return 2;
    }

    function saveProgress(record, courseId, snapshot) {
      if (typeof record === "string") {
        record = Object.assign({}, snapshot || {}, { learnerId: record, courseId: courseId });
      }
      if (!record || !record.learnerId || !record.courseId || !record.itemId) return null;
      var store = read();
      var id = record.id || progressKey(record.learnerId, record.courseId, record.itemId);
      var at = record.at || nowIso();
      store.progress[id] = {
        id: id,
        learnerId: record.learnerId,
        courseId: record.courseId,
        itemId: record.itemId,
        kind: record.kind || "progress",
        status: record.status || "done",
        at: at,
        detail: record.detail || {}
      };
      ensureEnrollment(record.learnerId, record.courseId);
      write();
      return store.progress[id];
    }

    function resetCourseProgress(learnerId, courseId) {
      var store = read();
      Object.keys(store.progress).forEach(function (id) {
        var row = store.progress[id];
        if (row.learnerId === learnerId && row.courseId === courseId) delete store.progress[id];
      });
      Object.keys(store.certificates).forEach(function (id) {
        var row = store.certificates[id];
        if (row.learnerId === learnerId && row.courseId === courseId) delete store.certificates[id];
      });
      write();
    }

    function issueCertificate(input, courseId, result) {
      if (typeof input === "string") {
        input = {
          learnerId: input,
          courseId: courseId,
          orgId: result && result.orgId,
          percent: result && (result.percent != null ? result.percent : result.score),
          issuedAt: result && (result.issuedAt || result.at)
        };
      }
      var store = read();
      var id = input.id || "cert-" + input.learnerId + "-" + input.courseId;
      if (!store.certificates[id]) {
        store.certificates[id] = {
          id: id,
          learnerId: input.learnerId,
          courseId: input.courseId,
          orgId: input.orgId,
          issuedAt: input.issuedAt || nowIso(),
          percent: input.percent
        };
      } else if (input.percent != null) {
        store.certificates[id].percent = input.percent;
      }
      write();
      return store.certificates[id];
    }

    function listCertificates(orgId) {
      return Object.keys(read().certificates).map(function (id) {
        return read().certificates[id];
      }).filter(function (row) {
        return !orgId || row.orgId === orgId;
      });
    }

    function inRange(iso, fromIso, toIso) {
      if (!iso || !fromIso || !toIso) return false;
      return iso >= fromIso && iso <= toIso;
    }

    function courseWasStarted(row) {
      return row && (row.status === "in_progress" || row.status === "completed");
    }

    function countActiveSeats(orgId, fromIso, toIso) {
      var seen = {};
      listEnrollments({ orgId: orgId }).forEach(function (row) {
        if (!courseWasStarted(row) || !inRange(row.startedAt, fromIso, toIso)) return;
        var person = getUser(row.learnerId);
        if (!person || person.role !== "learner") return;
        seen[person.learnerCode || row.learnerCode || person.id] = true;
      });
      return Object.keys(seen).length;
    }

    function boundDay(value, end) {
      if (!value) return "";
      if (String(value).length === 10) return value + (end ? "T23:59:59.999Z" : "T00:00:00.000Z");
      return value;
    }

    function assignmentFor(orgId, courseId) {
      var found = null;
      Object.keys(read().courseAssignments || {}).forEach(function (id) {
        var row = read().courseAssignments[id];
        if (row.orgId === orgId && row.courseId === courseId) found = row;
      });
      return found;
    }

    function buildOrgReport(orgId, period) {
      var org = getOrg(orgId);
      var query = period || {};
      var grantStart = (org && org.reportingPeriodStart) || "2026-10-01";
      var grantEnd = (org && org.reportingPeriodEnd) || "2026-11-30";
      var from = boundDay(query.from || grantStart, false);
      var to = boundDay(query.to || grantEnd, true);
      var courseFilter = query.courseId || "";
      var subscription = null;
      Object.keys(read().subscriptions || {}).forEach(function (id) {
        if (read().subscriptions[id].orgId === orgId) subscription = read().subscriptions[id];
      });
      var billing = global.LearnHereBilling || global.RangePathBilling;
      var invoiceRecords = Object.keys(read().invoices || {}).map(function (id) {
        return read().invoices[id];
      }).filter(function (row) { return row.orgId === orgId; });
      var learners = {};
      Object.keys(read().users).forEach(function (id) {
        var person = read().users[id];
        if (person.orgId === orgId && person.role === "learner") learners[id] = person;
      });
      var progress = listProgress().filter(function (row) {
        var person = getUser(row.learnerId);
        return person && person.orgId === orgId;
      });
      function lastActivity(learnerId, courseId) {
        var last = "";
        progress.forEach(function (row) {
          if (row.learnerId === learnerId && row.courseId === courseId && row.at && row.at > last) last = row.at;
        });
        return last;
      }
      var rows = listEnrollments({ orgId: orgId }).filter(function (row) {
        if (courseFilter && row.courseId !== courseFilter) return false;
        var person = learners[row.learnerId];
        if (!person) return false;
        var activity = row.lastActivityAt || lastActivity(row.learnerId, row.courseId);
        return inRange(row.startedAt, from, to) || inRange(row.completedAt, from, to) || inRange(activity, from, to);
      }).map(function (row) {
        var person = learners[row.learnerId];
        var assign = assignmentFor(orgId, row.courseId) || {};
        var cert = null;
        listCertificates(orgId).forEach(function (item) {
          if (item.learnerId === row.learnerId && item.courseId === row.courseId) cert = item;
        });
        var lessonsTotal = row.lessonsTotal || 0;
        var lessonsDone = row.lessonsCompletedCount || 0;
        var stated = typeof assign.statedCourseHours === "number" ? assign.statedCourseHours : null;
        var estimated = stated != null && lessonsTotal ? Math.round((stated * lessonsDone / lessonsTotal) * 10) / 10 : null;
        var exam = null;
        progress.forEach(function (item) {
          if (item.learnerId === row.learnerId && item.courseId === row.courseId && item.itemId === "exam:final") exam = item;
        });
        return {
          learnerId: row.learnerId,
          learnerCode: person.learnerCode || row.learnerCode || "",
          displayName: person.name || "",
          courseId: row.courseId,
          courseTitle: assign.courseTitle || row.courseId,
          calpCategoryTag: assign.calpCategoryTag || "",
          opportunityType: assign.opportunityType || "",
          reportingPeriodStart: assign.reportingPeriodStart || grantStart,
          reportingPeriodEnd: assign.reportingPeriodEnd || grantEnd,
          courseStartedAt: row.startedAt || "",
          lastActivityAt: row.lastActivityAt || lastActivity(row.learnerId, row.courseId),
          status: row.status,
          started: courseWasStarted(row),
          lessonsCompletedCount: lessonsDone,
          lessonsTotal: lessonsTotal,
          completed: row.status === "completed",
          statedCourseHours: stated,
          finalExamScore: exam && exam.detail && exam.detail.percent != null ? exam.detail.percent : (cert ? cert.percent : ""),
          finalExamAttempts: exam && exam.detail && exam.detail.attempts ? exam.detail.attempts.length : (row.status === "completed" ? 1 : ""),
          finalExamPassed: Boolean((exam && exam.detail && exam.detail.passed) || row.status === "completed"),
          estimatedTimeOnTaskHours: estimated,
          certificateId: cert ? cert.id : "",
          certificateIssuedAt: cert ? cert.issuedAt : "",
          gender: person.gender || "",
          ageGroup: person.ageGroup || "",
          previousSchooling: person.previousSchooling || "",
          learnerProfile: person.learnerProfile || "",
          pulseSkillsUsedInDailyLife: row.pulseSkillsUsedInDailyLife || "",
          pulseProgressTowardGoal: row.pulseProgressTowardGoal || "",
          pulseIncreasedConfidence: row.pulseIncreasedConfidence || "",
          pulseProgramRelevant: row.pulseProgramRelevant || "",
          pulseFeltWelcome: row.pulseFeltWelcome || "",
          sample: true
        };
      });
      var codes = {};
      var startedCodes = {};
      rows.forEach(function (row) {
        if (row.learnerCode) codes[row.learnerCode] = true;
        if (row.started && row.learnerCode) startedCodes[row.learnerCode] = true;
      });
      var byCourse = {};
      rows.forEach(function (row) {
        if (!byCourse[row.courseId]) {
          byCourse[row.courseId] = {
            courseId: row.courseId,
            courseTitle: row.courseTitle,
            calpCategoryTag: row.calpCategoryTag,
            opportunityType: row.opportunityType,
            statedCourseHours: row.statedCourseHours,
            learners: 0,
            starts: 0,
            completions: 0,
            statedHoursTotal: 0,
            estimatedHoursTotal: 0,
            codes: {}
          };
        }
        var bucket = byCourse[row.courseId];
        bucket.codes[row.learnerCode] = true;
        if (row.started) bucket.starts += 1;
        if (row.completed) {
          bucket.completions += 1;
          if (typeof row.statedCourseHours === "number") bucket.statedHoursTotal += row.statedCourseHours;
        }
        if (typeof row.estimatedTimeOnTaskHours === "number") bucket.estimatedHoursTotal += row.estimatedTimeOnTaskHours;
      });
      var courses = Object.keys(byCourse).map(function (id) {
        var bucket = byCourse[id];
        bucket.learners = Object.keys(bucket.codes).length;
        delete bucket.codes;
        bucket.statedHoursTotal = Math.round(bucket.statedHoursTotal * 10) / 10;
        bucket.estimatedHoursTotal = Math.round(bucket.estimatedHoursTotal * 10) / 10;
        bucket.completionRate = bucket.starts ? Math.round((bucket.completions / bucket.starts) * 100) : 0;
        return bucket;
      });
      function tally(key) {
        var counts = {};
        rows.forEach(function (row) {
          var value = row[key] || "not collected";
          counts[value] = (counts[value] || 0) + 1;
        });
        return counts;
      }
      var pulseKeys = [
        "pulseSkillsUsedInDailyLife",
        "pulseProgressTowardGoal",
        "pulseIncreasedConfidence",
        "pulseProgramRelevant",
        "pulseFeltWelcome"
      ];
      var pulseTotals = {};
      pulseKeys.forEach(function (key) {
        var counts = tally(key);
        var yes = counts.yes || 0;
        var answered = yes + (counts.no || 0);
        pulseTotals[key] = {
          counts: counts,
          percentYes: answered ? Math.round((yes / answered) * 100) : null
        };
      });
      var starts = rows.filter(function (row) { return row.started; }).length;
      var completions = rows.filter(function (row) { return row.completed; }).length;
      var statedHours = courses.reduce(function (sum, course) { return sum + course.statedHoursTotal; }, 0);
      var estimatedHours = courses.reduce(function (sum, course) { return sum + course.estimatedHoursTotal; }, 0);
      return {
        sample: true,
        banner: "Sample data, not real learners",
        org: org,
        seatCap: org && typeof org.seatCap === "number" ? org.seatCap : null,
        accessState: org ? org.accessState || "active" : "",
        period: { from: from, to: to },
        grantPeriod: { start: grantStart, end: grantEnd },
        activeLearners: Object.keys(startedCodes).length,
        seatNote: "Unique learner codes who started a course in this period. This count is a report metric, not a charge.",
        uniqueLearnerCount: Object.keys(codes).length,
        totals: {
          uniqueLearners: Object.keys(codes).length,
          starts: starts,
          completions: completions,
          completionRate: starts ? Math.round((completions / starts) * 100) : 0,
          statedHours: Math.round(statedHours * 10) / 10,
          estimatedHours: Math.round(estimatedHours * 10) / 10,
          certificates: completions
        },
        courses: courses,
        rows: rows,
        demographicTotals: {
          gender: tally("gender"),
          ageGroup: tally("ageGroup"),
          previousSchooling: tally("previousSchooling"),
          learnerProfile: tally("learnerProfile")
        },
        pulseTotals: pulseTotals,
        draft: "SAMPLE. In this selected period, " + Object.keys(codes).length + " learner codes were enrolled and " + Object.keys(startedCodes).length + " started a course. " + completions + " of " + starts + " starts were completed. Stated hours for completions add up to " + (Math.round(statedHours * 10) / 10) + " (an estimate, not a timer). Staff still have to check the current funder form before they use these numbers.",
        subscription: billing ? billing.getSubscription(subscription) : null,
        invoices: billing ? billing.listInvoices(invoiceRecords) : [],
        examLocks: listExamLocks(orgId),
        classes: Object.keys(read().classes).map(function (id) { return read().classes[id]; }).filter(function (row) { return row.orgId === orgId; }),
        assignments: Object.keys(read().courseAssignments || {}).map(function (id) { return read().courseAssignments[id]; }).filter(function (row) { return row.orgId === orgId; }),
        learners: Object.keys(learners).map(function (id) { return learners[id]; }),
        enrollments: listEnrollments({ orgId: orgId }),
        certificates: listCertificates(orgId),
        progress: progress
      };
    }

    function getOrgReport(orgId, period) {
      var allowed = scopedOrgId(orgId);
      if (!allowed) return { error: "This role cannot view that council.", orgId: orgId };
      return buildOrgReport(allowed, period);
    }

    function getSampleReport(period) {
      return buildOrgReport("org-example", period);
    }

    function resetStore() {
      memory = seedFromWindow();
      return write();
    }

    function getLearnerView() {
      var user = getSessionUser();
      var org = user && user.orgId ? getOrg(user.orgId) : null;
      var courses = {};
      if (user) {
        listProgress(user.id).forEach(function (row) {
          if (!courses[row.courseId]) courses[row.courseId] = getProgress(user.id, row.courseId);
        });
      }
      return {
        learnerName: user && user.name ? user.name : "",
        councilName: (user && user.certificateCouncil) || (org && org.name) || "",
        courses: courses
      };
    }

    function saveLearnerView(view) {
      var user = getSessionUser();
      if (!user) return false;
      if (view && user.role === "learner") {
        var patch = {};
        if (view.learnerName && view.learnerName !== user.name) patch.name = view.learnerName;
        if (view.councilName) patch.certificateCouncil = view.councilName;
        if (Object.keys(patch).length) updateUser(user.id, patch);
      }
      var courses = (view && view.courses) || {};
      Object.keys(courses).forEach(function (courseId) {
        var course = courses[courseId] || {};
        var lessons = course.lessons || {};
        Object.keys(lessons).forEach(function (number) {
          var row = lessons[number] || {};
          if (row.done) {
            saveProgress({
              learnerId: user.id,
              courseId: courseId,
              itemId: "quiz:" + number,
              kind: "quiz",
              status: "done",
              at: row.quizAt || nowIso(),
              detail: { correct: row.correct, total: row.total, percent: row.percent, done: true }
            });
          }
          var sections = row.sections || {};
          Object.keys(sections).forEach(function (sectionId) {
            var stamped = sections[sectionId];
            saveProgress({
              learnerId: user.id,
              courseId: courseId,
              itemId: "section:" + number + ":" + sectionId,
              kind: "section",
              status: "read",
              at: typeof stamped === "string" ? stamped : nowIso(),
              detail: {}
            });
          });
          if (row.assignment) {
            saveProgress({
              learnerId: user.id,
              courseId: courseId,
              itemId: "assignment:" + number,
              kind: "assignment",
              status: "done",
              at: row.assignmentAt || nowIso(),
              detail: {}
            });
          }
        });
        if (course.final) {
          saveProgress({
            learnerId: user.id,
            courseId: courseId,
            itemId: "exam:final",
            kind: "exam",
            status: course.final.passed ? "passed" : "scored",
            at: course.final.at || nowIso(),
            detail: {
              correct: course.final.correct,
              total: course.final.total,
              percent: course.final.percent,
              passed: Boolean(course.final.passed),
              date: course.final.date || "",
              attempts: course.final.attempts || []
            }
          });
          (course.final.attempts || []).forEach(function (attempt, index) {
            saveProgress({
              learnerId: user.id,
              courseId: courseId,
              itemId: "exam:attempt:" + (index + 1),
              kind: "exam",
              status: attempt.passed ? "passed" : "scored",
              at: attempt.at || course.final.at || nowIso(),
              detail: attempt
            });
          });
          if (course.final.passed && user.orgId) {
            issueCertificate({
              learnerId: user.id,
              courseId: courseId,
              orgId: user.orgId,
              percent: course.final.percent,
              issuedAt: course.final.at || nowIso()
            });
          }
        }
      });
      return storageOk;
    }

    return {
      storageOk: function () { return storageOk; },
      nowIso: nowIso,
      getSessionUser: getSessionUser,
      setSession: setSession,
      getUser: getUser,
      updateUser: updateUser,
      getOrg: getOrg,
      canAccess: canAccess,
      setAccessState: setAccessState,
      examAttemptLimit: examAttemptLimit,
      listExamLocks: listExamLocks,
      resetExamAttempts: resetExamAttempts,
      listEnrollments: listEnrollments,
      saveEnrollment: saveEnrollment,
      getProgress: getProgress,
      listProgress: listProgress,
      saveProgress: saveProgress,
      resetCourseProgress: resetCourseProgress,
      issueCertificate: issueCertificate,
      listCertificates: listCertificates,
      countActiveSeats: countActiveSeats,
      getOrgReport: getOrgReport,
      getSampleReport: getSampleReport,
      resetStore: resetStore,
      getLearnerView: getLearnerView,
      saveLearnerView: saveLearnerView
    };
  }

  global.LearnHereData = createLocalAdapter();
  global.RangePathData = global.LearnHereData;
})(window);
