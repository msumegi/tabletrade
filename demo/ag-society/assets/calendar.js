(function () {
  var root = document.querySelector("[data-calendar]");
  if (!root) return;

  var blocks = Array.prototype.slice.call(root.querySelectorAll("[data-month]"));
  var events = Array.prototype.slice.call(root.querySelectorAll("[data-date]"));
  var grid = root.querySelector("[data-cal-grid]");
  var label = root.querySelector("[data-cal-label]");
  var live = root.querySelector("[data-cal-live]");
  var prev = root.querySelector("[data-cal-prev]");
  var next = root.querySelector("[data-cal-next]");
  var monthBtn = root.querySelector("[data-view-month]");
  var listBtn = root.querySelector("[data-view-list]");
  var clearBtn = root.querySelector("[data-cal-clear]");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var shortDow = ["S", "M", "T", "W", "T", "F", "S"];
  var months = blocks.map(function (block) { return block.getAttribute("data-month"); });
  var start = months[0];
  var end = months[months.length - 1];

  function keyFromDate(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  var todayKey = keyFromDate(new Date());
  var cursor = months.indexOf(todayKey) !== -1 ? todayKey : (months.indexOf("2026-11") !== -1 ? "2026-11" : start);
  var view = "month";
  var selected = null;
  var hashId = location.hash.replace(/^#/, "");
  if (hashId) {
    var hashed = root.querySelector("[id='" + hashId.replace(/'/g, "") + "']");
    if (hashed && hashed.getAttribute("data-date")) {
      cursor = hashed.getAttribute("data-date").slice(0, 7);
      selected = hashed.getAttribute("data-date");
    }
  }

  function parse(key) {
    var parts = key.split("-");
    return { y: Number(parts[0]), m: Number(parts[1]) - 1 };
  }

  function render() {
    var parts = parse(cursor);
    var name = monthNames[parts.m] + " " + parts.y;
    label.textContent = name;
    live.textContent = (view === "list" ? "List, " : "Month, ") + name + (selected ? ", filtered to one day" : "");
    prev.disabled = cursor === start;
    next.disabled = cursor === end;
    monthBtn.setAttribute("aria-pressed", view === "month" ? "true" : "false");
    listBtn.setAttribute("aria-pressed", view === "list" ? "true" : "false");
    grid.hidden = view !== "month";
    clearBtn.hidden = !selected;
    root.classList.toggle("is-list", view === "list");

    blocks.forEach(function (block) {
      block.hidden = block.getAttribute("data-month") !== cursor;
    });
    events.forEach(function (event) {
      var date = event.getAttribute("data-date");
      var inMonth = date.slice(0, 7) === cursor;
      event.hidden = !(inMonth && (!selected || date === selected));
    });

    if (view !== "month") return;

    var first = new Date(parts.y, parts.m, 1).getDay();
    var days = new Date(parts.y, parts.m + 1, 0).getDate();
    var byDay = {};
    events.forEach(function (event) {
      var date = event.getAttribute("data-date");
      if (date.slice(0, 7) !== cursor) return;
      if (!byDay[date]) byDay[date] = [];
      byDay[date].push(event.querySelector("h3").textContent);
    });

    grid.replaceChildren();
    shortDow.forEach(function (day, index) {
      var cell = document.createElement("div");
      cell.className = "cal-dow";
      cell.textContent = day;
      cell.title = dow[index];
      grid.appendChild(cell);
    });
    for (var blank = 0; blank < first; blank += 1) {
      var empty = document.createElement("div");
      empty.className = "cal-empty";
      grid.appendChild(empty);
    }
    for (var day = 1; day <= days; day += 1) {
      var dateKey = cursor + "-" + String(day).padStart(2, "0");
      var titles = byDay[dateKey];
      var cell;
      if (titles) {
        cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cal-day has" + (selected === dateKey ? " is-on" : "");
        cell.setAttribute("aria-pressed", selected === dateKey ? "true" : "false");
        cell.setAttribute("aria-label", monthNames[parts.m] + " " + day + ": " + titles.join(", "));
        cell.addEventListener("click", selectDay(dateKey));
      } else {
        cell = document.createElement("div");
        cell.className = "cal-day";
        cell.setAttribute("aria-hidden", "true");
      }
      var num = document.createElement("span");
      num.textContent = String(day);
      cell.appendChild(num);
      if (titles) {
        var mark = document.createElement("i");
        mark.setAttribute("aria-hidden", "true");
        cell.appendChild(mark);
      }
      grid.appendChild(cell);
    }
  }

  function selectDay(dateKey) {
    return function () {
      selected = selected === dateKey ? null : dateKey;
      render();
      if (!selected) return;
      var target = root.querySelector('[data-date="' + dateKey + '"]');
      if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    };
  }

  function step(direction) {
    var index = months.indexOf(cursor) + direction;
    if (index < 0 || index >= months.length) return;
    cursor = months[index];
    selected = null;
    render();
  }

  prev.addEventListener("click", function () { step(-1); });
  next.addEventListener("click", function () { step(1); });
  monthBtn.addEventListener("click", function () { view = "month"; render(); });
  listBtn.addEventListener("click", function () { view = "list"; selected = null; render(); });
  clearBtn.addEventListener("click", function () { selected = null; render(); });
  render();
})();
