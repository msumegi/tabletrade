/* Demo billing stub. No processor SDK, no network calls, no keys.
   A later provider replaces this object. The player never calls a processor. */
(function (global) {
  "use strict";

  function subscriptionFrom(record) {
    var row = record || {};
    return {
      sample: true,
      status: row.providerStatus || "active",
      collection: row.collection || "card",
      periodStart: row.currentPeriodStart || "",
      periodEnd: row.currentPeriodEnd || "",
      amount: row.amount == null ? 149 : row.amount,
      currency: row.currency || "CAD"
    };
  }

  function invoiceFrom(record) {
    var row = record || {};
    return {
      sample: true,
      number: row.number || "",
      hostedUrl: "",
      pdfUrl: "",
      amountDue: row.amountDue == null ? 0 : row.amountDue,
      amountPaid: row.amountPaid == null ? 0 : row.amountPaid,
      currency: row.currency || "CAD",
      status: row.status || "open",
      dueDate: row.dueDate || "",
      paidAt: row.paidAt || ""
    };
  }

  global.LearnHereBilling = {
    id: "demo-stub",
    createCustomer: function (org) {
      return { providerCustomerId: "sample-customer-" + (org && org.id ? org.id : "org"), sample: true };
    },
    startMonthlySubscription: function (org, method) {
      return {
        providerSubscriptionId: "sample-subscription-" + (org && org.id ? org.id : "org"),
        collection: method || "card",
        sample: true
      };
    },
    issueAnnualInvoice: function (org, amount, dueDays) {
      return {
        providerInvoiceId: "sample-invoice-" + (org && org.id ? org.id : "org"),
        amount: amount,
        dueDays: dueDays,
        sample: true
      };
    },
    getSubscription: function (record) {
      return subscriptionFrom(record);
    },
    cancelAtPeriodEnd: function () {
      return { sample: true, cancelAtPeriodEnd: true };
    },
    updatePaymentMethodLink: function () {
      return "";
    },
    getInvoice: function (record) {
      return invoiceFrom(record);
    },
    listInvoices: function (records) {
      return (records || []).map(invoiceFrom);
    }
  };
  global.RangePathBilling = global.LearnHereBilling;
})(window);
