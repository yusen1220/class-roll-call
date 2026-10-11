(() => {
  'use strict';

  const STORAGE_KEY = 'class-roll-call-v1';
  const SHUFFLE_MS = 1200;
  const SHUFFLE_INTERVAL_MS = 70;
  const VIEWS = ['classes', 'students', 'roll'];
  const CSV_BOM = '\uFEFF';
  const CSV_HEADERS = ['座號', '姓名'];
  const FORMULA_PREFIX = /^[=+\-@\t\r]/;

  let state = loadState();
  let currentView = 'classes';
  let calledIds = new Set();
  let isRolling = false;
  let onEditSubmit = null;

  const $ = (id) => document.getElementById(id);
  const els = {
    menuItems: document.querySelectorAll('.menu__item'),
    views: document.querySelectorAll('.view'),
    classForm: $('class-form'), className: $('class-name'),
    classList: $('class-list'), classEmpty: $('class-empty'),
    studentClass: $('student-class'), studentForm: $('student-form'),
    studentName: $('student-name'), studentList: $('student-list'),
    studentEmpty: $('student-empty'),
    rollClass: $('roll-class'), noRepeat: $('no-repeat'),
    rollDisplay: $('roll-display'), rollInfo: $('roll-info'),
    rollBtn: $('roll-btn'), rollReset: $('roll-reset'),
    exportBtn: $('export-btn'),
    dialog: $('edit-dialog'), editForm: $('edit-form'),
    editTitle: $('edit-title'), editInput: $('edit-input'),
    editCancel: $('edit-cancel'),
  };

  /* ---------- State ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadState() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && Array.isArray(data.classes)) {
        return { classes: data.classes, selectedId: data.selectedId ?? null };
      }
    } catch (err) {
      console.warn('讀取資料失敗，使用空資料', err);
    }
    return { classes: [], selectedId: null };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      alert('無法儲存資料（瀏覽器儲存空間不可用）。');
    }
  }

  function commit() {
    persist();
    renderAll();
  }

  const getClass = (id) => state.classes.find((c) => c.id === id) ?? null;
  const getSelected = () => getClass(state.selectedId);

  function isDuplicate(list, name, ignoreId) {
    const key = name.toLocaleLowerCase();
    return list.some((item) => item.id !== ignoreId && item.name.toLocaleLowerCase() === key);
  }

  function ensureSelection() {
    if (!getSelected()) state.selectedId = state.classes[0]?.id ?? null;
  }

  /* ---------- Class actions ---------- */
  function addClass(name) {
    if (isDuplicate(state.classes, name)) return alert('已有相同名稱的班級。');
    const cls = { id: uid(), name, students: [] };
    state.classes.push(cls);
    state.selectedId = cls.id;
    commit();
  }

  function renameClass(id, name) {
    const cls = getClass(id);
    if (!cls) return;
    if (isDuplicate(state.classes, name, id)) return alert('已有相同名稱的班級。');
    cls.name = name;
    commit();
  }

  function deleteClass(id) {
    const cls = getClass(id);
    if (!cls || !confirm(`確定刪除班級「${cls.name}」及其 ${cls.students.length} 位學生？`)) return;
    state.classes = state.classes.filter((c) => c.id !== id);
    ensureSelection();
    commit();
  }

  /* ---------- Student actions ---------- */
  function addStudent(name) {
    const cls = getSelected();
    if (!cls) return alert('請先建立並選擇班級。');
    if (isDuplicate(cls.students, name)) return alert('此班級已有同名學生。');
    cls.students.push({ id: uid(), name });
    commit();
  }

  function renameStudent(id, name) {
    const cls = getSelected();
    const student = cls?.students.find((s) => s.id === id);
    if (!student) return;
    if (isDuplicate(cls.students, name, id)) return alert('此班級已有同名學生。');
    student.name = name;
    commit();
  }

  function deleteStudent(id) {
    const cls = getSelected();
    const student = cls?.students.find((s) => s.id === id);
    if (!student || !confirm(`確定刪除學生「${student.name}」？`)) return;
    cls.students = cls.students.filter((s) => s.id !== id);
    commit();
  }

  /* ---------- DOM helpers ---------- */
  function makeButton(text, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function makeItem(labelText, ...children) {
    const li = document.createElement('li');
    li.className = 'list__item';
    const label = document.createElement('span');
    label.className = 'list__select';
    label.textContent = labelText;
    li.append(label, ...children);
    return li;
  }

  function makeMeta(text) {
    const span = document.createElement('span');
    span.className = 'list__count';
    span.textContent = text;
    return span;
  }

  function fillClassSelect(select) {
    select.replaceChildren();
    if (state.classes.length === 0) {
      select.append(new Option('（尚無班級）', ''));
      select.disabled = true;
      return;
    }
    select.disabled = false;
    state.classes.forEach((c) => select.append(new Option(`${c.name}（${c.students.length} 人）`, c.id)));
    select.value = state.selectedId;
  }

  function openEdit(title, value, onSubmit) {
    els.editTitle.textContent = title;
    els.editInput.value = value;
    onEditSubmit = onSubmit;
    els.dialog.showModal();
    els.editInput.select();
  }

  /* ---------- Render ---------- */
  function renderClasses() {
    els.classEmpty.hidden = state.classes.length > 0;
    els.classList.replaceChildren(...state.classes.map((cls) => makeItem(
      cls.name,
      makeMeta(`${cls.students.length} 人`),
      makeButton('管理學生', 'btn btn--small', () => {
        state.selectedId = cls.id;
        persist();
        showView('students');
      }),
      makeButton('編輯', 'btn btn--small', () =>
        openEdit('編輯班級名稱', cls.name, (v) => renameClass(cls.id, v))),
      makeButton('刪除', 'btn btn--small btn--danger', () => deleteClass(cls.id)),
    )));
  }

  function renderStudents() {
    const cls = getSelected();
    fillClassSelect(els.studentClass);
    els.studentName.disabled = !cls;
    els.studentForm.querySelector('button[type="submit"]').disabled = !cls;

    const students = cls?.students ?? [];
    els.studentList.replaceChildren(...students.map((s, i) => makeItem(
      `${i + 1}. ${s.name}`,
      makeButton('編輯', 'btn btn--small', () =>
        openEdit('編輯學生姓名', s.name, (v) => renameStudent(s.id, v))),
      makeButton('刪除', 'btn btn--small btn--danger', () => deleteStudent(s.id)),
    )));

    els.studentEmpty.hidden = students.length > 0;
    els.studentEmpty.textContent = cls
      ? '此班級尚無學生，請新增。'
      : '請先到「班級管理」新增班級。';
  }

  function renderRoll() {
    fillClassSelect(els.rollClass);
    const cls = getSelected();
    const total = cls?.students.length ?? 0;
    els.rollBtn.disabled = isRolling || total === 0;
    els.rollReset.disabled = isRolling;

    if (!cls) {
      els.rollInfo.textContent = '請先建立班級與學生。';
    } else if (total === 0) {
      els.rollInfo.textContent = '此班級沒有學生，無法點名。';
    } else if (els.noRepeat.checked) {
      const called = cls.students.filter((s) => calledIds.has(s.id)).length;
      els.rollInfo.textContent = `已點名 ${called} / ${total} 人`;
    } else {
      els.rollInfo.textContent = `共 ${total} 位學生`;
    }
  }

  function renderAll() {
    renderClasses();
    renderStudents();
    renderRoll();
  }

  function showView(name) {
    if (!VIEWS.includes(name)) return;
    currentView = name;
    els.views.forEach((v) => { v.hidden = v.dataset.view !== name; });
    els.menuItems.forEach((item) => {
      const isActive = item.dataset.view === name;
      item.classList.toggle('menu__item--active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    renderAll();
  }

  /* ---------- Roll call ---------- */
  function resetRoll(showHint = true) {
    calledIds = new Set();
    if (showHint) {
      els.rollDisplay.textContent = '請按「點名」';
      els.rollDisplay.className = 'roll__display';
    }
    renderRoll();
  }

  function randomIndex(max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }

  function startRoll() {
    const cls = getSelected();
    if (isRolling || !cls || cls.students.length === 0) return;

    let pool = cls.students;
    if (els.noRepeat.checked) {
      pool = cls.students.filter((s) => !calledIds.has(s.id));
      if (pool.length === 0) {
        calledIds = new Set();
        pool = cls.students;
      }
    }
    const picked = pool[randomIndex(pool.length)];

    isRolling = true;
    renderRoll();
    els.rollDisplay.className = 'roll__display roll__display--running';
    const timer = setInterval(() => {
      els.rollDisplay.textContent = cls.students[randomIndex(cls.students.length)].name;
    }, SHUFFLE_INTERVAL_MS);

    setTimeout(() => {
      clearInterval(timer);
      isRolling = false;
      if (els.noRepeat.checked) calledIds.add(picked.id);
      els.rollDisplay.textContent = picked.name;
      els.rollDisplay.className = 'roll__display roll__display--done';
      renderRoll();
    }, SHUFFLE_MS);
  }

  /* ---------- Export ---------- */
  function escapeCsvCell(value) {
    let text = String(value);
    if (FORMULA_PREFIX.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function sanitizeFileName(name) {
    // eslint-disable-next-line no-control-regex
    const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    return cleaned || '班級';
  }

  function buildStudentCsv(cls) {
    const rows = [
      CSV_HEADERS,
      ...cls.students.map((s, i) => [i + 1, s.name]),
    ];
    return CSV_BOM + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  }

  function exportStudents() {
    const cls = getSelected();
    if (!cls) return alert('請先建立並選擇班級。');
    if (cls.students.length === 0) return alert('此班級沒有學生，無法匯出。');

    const blob = new Blob([buildStudentCsv(cls)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(cls.name)}_學生名單.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /* ---------- Events ---------- */
  function bindSubmit(form, input, handler) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      handler(value);
      input.value = '';
      input.focus();
    });
  }

  function selectClass(id) {
    state.selectedId = id || null;
    persist();
    resetRoll();
    renderAll();
  }

  els.menuItems.forEach((item) => item.addEventListener('click', () => {
    if (!item.dataset.view) return;
    showView(item.dataset.view);
  }));

  els.exportBtn.addEventListener('click', exportStudents);

  bindSubmit(els.classForm, els.className, addClass);
  bindSubmit(els.studentForm, els.studentName, addStudent);

  els.studentClass.addEventListener('change', () => selectClass(els.studentClass.value));
  els.rollClass.addEventListener('change', () => selectClass(els.rollClass.value));
  els.noRepeat.addEventListener('change', () => resetRoll(false));
  els.rollBtn.addEventListener('click', startRoll);
  els.rollReset.addEventListener('click', () => resetRoll());

  els.editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = els.editInput.value.trim();
    if (!value) return;
    els.dialog.close();
    onEditSubmit?.(value);
    onEditSubmit = null;
  });

  els.editCancel.addEventListener('click', () => {
    onEditSubmit = null;
    els.dialog.close();
  });

  ensureSelection();
  showView(currentView);
})();
