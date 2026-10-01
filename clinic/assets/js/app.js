/* ==========================================================================
   app.js
   تعامل‌های سبک قالب (بدون وابستگی): تب، چیپ، منوی موبایل، ویزارد، مودال
   ========================================================================== */
(function () {
  'use strict';

  /* --- منوی موبایل / سایدبار ---------------------------------------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle-nav]');
    if (t) {
      var nav = document.querySelector('.sidebar');
      if (nav) nav.classList.toggle('open');
      return;
    }
    // بستن سایدبار با کلیک بیرون (موبایل)
    var side = document.querySelector('.sidebar.open');
    if (side && !e.target.closest('.sidebar')) side.classList.remove('open');
  });

  /* --- گروه‌های انتخابی: تب، چیپ، اسلات، کارت انتخاب ---------------------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('.tabs button, .tabline button, .chips button, .slot:not(.off), .choice, .cal .day:not(.off)');
    if (!el) return;

    var group = el.closest('.tabs, .tabline, .chips, [data-group], .cal');
    if (!group) return;

    var sel = el.matches('.slot') ? '.slot'
      : el.matches('.choice') ? '.choice'
      : el.matches('.day') ? '.day'
      : 'button';

    group.querySelectorAll(sel).forEach(function (n) { n.classList.remove('active'); });
    el.classList.add('active');

    // پنل‌های مرتبط با تب — فقط پنل‌هایی که همین گروه صدایشان می‌زند
    var target = el.getAttribute('data-tab');
    if (target) {
      var names = Array.prototype.map.call(
        group.querySelectorAll('[data-tab]'),
        function (b) { return b.getAttribute('data-tab'); });
      document.querySelectorAll('[data-pane]').forEach(function (p) {
        var v = p.getAttribute('data-pane');
        if (names.indexOf(v) > -1) p.classList.toggle('hide', v !== target);
      });
    }
  });

  /* --- مودال --------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-modal]');
    if (open) {
      var m = document.getElementById(open.getAttribute('data-modal'));
      if (m) m.classList.remove('hide');
      return;
    }
    if (e.target.closest('[data-modal-close]') || e.target.classList.contains('modal-back')) {
      var back = e.target.closest('.modal-back');
      if (back) back.classList.add('hide');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-back:not(.hide)').forEach(function (m) { m.classList.add('hide'); });
    }
  });

  /* --- ویزارد چندمرحله‌ای --------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step-go]');
    if (!b) return;
    var host = document.querySelector('[data-wizard]');
    if (!host) return;

    var steps = Array.prototype.slice.call(host.querySelectorAll('[data-step]'));
    var current = steps.findIndex(function (s) { return !s.classList.contains('hide'); });
    var dir = b.getAttribute('data-step-go');
    var next = dir === 'next' ? current + 1 : dir === 'prev' ? current - 1 : parseInt(dir, 10);

    if (next < 0 || next >= steps.length) return;
    steps.forEach(function (s, i) { s.classList.toggle('hide', i !== next); });

    document.querySelectorAll('.steps .step').forEach(function (s, i) {
      s.classList.toggle('active', i === next);
      s.classList.toggle('done', i < next);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* --- موتور فیلتر جدول ----------------------------------------------------
     هاست:  <div data-filter-host="#t-x"> … </div>
     چیپ:   <div class="chips" data-f="status"><button data-v="">همه</button>…
     سلکت:  <select data-f="doctor"><option value="">همه</option>…
     جستجو: <input data-filter="#t-x">
     ردیف:  <tr data-status="debt" data-doctor="d1">
     شمارنده: <span data-count="#t-x">  |  شمارنده هر چیپ: <span class="n" data-n="late">
     ------------------------------------------------------------------------ */
  function rowsOf(sel) {
    var t = document.querySelector(sel);
    if (!t) return [];
    var body = t.tagName === 'TABLE' ? t.querySelector('tbody') : t;
    return Array.prototype.slice.call(body ? body.children : []);
  }

  function applyFilter(host) {
    var sel = host.getAttribute('data-filter-host');
    var rows = rowsOf(sel);
    if (!rows.length) return;

    var cond = {};
    host.querySelectorAll('.chips[data-f]').forEach(function (g) {
      var on = g.querySelector('button.active');
      var v = on ? (on.getAttribute('data-v') || '') : '';
      if (v) cond[g.getAttribute('data-f')] = v;
    });
    host.querySelectorAll('select[data-f]').forEach(function (s2) {
      if (s2.value) cond[s2.getAttribute('data-f')] = s2.value;
    });
    var box = host.querySelector('[data-filter]');
    var q = box ? box.value.trim().toLowerCase() : '';

    var shown = 0;
    rows.forEach(function (r) {
      var ok = true;
      Object.keys(cond).forEach(function (k) {
        var have = (r.getAttribute('data-' + k) || '').split(' ');
        if (have.indexOf(cond[k]) === -1) ok = false;
      });
      if (ok && q && r.textContent.toLowerCase().indexOf(q) === -1) ok = false;
      r.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });

    document.querySelectorAll('[data-count="' + sel + '"]').forEach(function (c) {
      c.textContent = shown.toLocaleString('fa-IR');
    });
    var empty = document.querySelector('[data-empty="' + sel + '"]');
    if (empty) empty.classList.toggle('hide', shown > 0);
  }

  /* شمارنده اولیه هر چیپ از روی خود ردیف‌ها */
  function countChips(host) {
    var rows = rowsOf(host.getAttribute('data-filter-host'));
    host.querySelectorAll('.chips[data-f]').forEach(function (g) {
      var key = g.getAttribute('data-f');
      g.querySelectorAll('button').forEach(function (b) {
        var n = b.querySelector('.n');
        if (!n) return;
        var v = b.getAttribute('data-v') || '';
        var c = v ? rows.filter(function (r) {
          return (r.getAttribute('data-' + key) || '').split(' ').indexOf(v) > -1;
        }).length : rows.length;
        n.textContent = c.toLocaleString('fa-IR');
      });
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter-host] .chips[data-f] button');
    if (b) { applyFilter(b.closest('[data-filter-host]')); }
  });
  document.addEventListener('change', function (e) {
    var s2 = e.target.closest('[data-filter-host] select[data-f]');
    if (s2) applyFilter(s2.closest('[data-filter-host]'));
  });
  document.addEventListener('input', function (e) {
    var inp = e.target.closest('[data-filter]');
    if (!inp) return;
    var host = inp.closest('[data-filter-host]');
    if (host) { applyFilter(host); return; }
    var table = document.querySelector(inp.getAttribute('data-filter'));
    if (!table) return;
    var q = inp.value.trim().toLowerCase();
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.style.display = !q || tr.textContent.toLowerCase().indexOf(q) > -1 ? '' : 'none';
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-filter-host]').forEach(function (h) {
      countChips(h); applyFilter(h);
    });
  });

  /* --- بستن/بازکردن یک ساعت یا یک روز در جدول روزانه ------------------------ */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-block-slot]');
    if (!b) return;
    var cell = b.closest('td') || b.parentElement;
    var el = cell.querySelector('.cel') || b;
    el.classList.toggle('blocked');
    b.textContent = el.classList.contains('blocked') ? 'بازکردن' : 'بستن';
  });
})();
