// app.js

// ---------- Tabs ----------
const tabs = document.querySelectorAll(".tab");

function showSection(id){
  document.querySelectorAll("main section").forEach(sec => sec.style.display = "none");
  const el = document.getElementById(id);
  if (el) el.style.display = "block";

  tabs.forEach(tab => {
    if (tab.dataset.target === id) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
}

tabs.forEach(tab => tab.addEventListener("click", () => {
  const id = tab.dataset.target;
  if (!id) return;
  showSection(id);
  history.replaceState(null, "", "#" + id);
}));

const initial = location.hash.replace("#","") || "home";
showSection(document.getElementById(initial) ? initial : "home");

// ---------- Storage helpers ----------
const LS = {
  get(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch{ return fallback; }
  },
  set(key, val){
    localStorage.setItem(key, JSON.stringify(val));
  }
};

// ---------- Demo auth state (used for local data keys) ----------
let currentUser = LS.get("ap_user", null); // {email}
function setUser(email){
  currentUser = email ? {email} : null;
  LS.set("ap_user", currentUser);
  renderAll();
}

// Hook into login UI
const msg = document.getElementById("msg");
const status = document.getElementById("status");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");

const signupBtn = document.getElementById("signupBtn");
const loginBtn  = document.getElementById("loginBtn");
const resetBtn  = document.getElementById("resetBtn");
const logoutBtn = document.getElementById("logoutBtn");
const googleBtn = document.getElementById("googleBtn");

function setMsg(text, ok=false){
  if (!msg) return;
  msg.textContent = text;
  msg.className = ok ? "msg ok" : "msg";
}

// ---------- Firebase Auth + Firestore ----------
let fbReady = false;
let db = null;

function initFirebase(){
  try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    fbReady = true;

    firebase.auth().onAuthStateChanged((user) => {
      if (user){
        setUser(user.email);
        if (status) status.textContent = "Logged in as: " + user.email;
        if (logoutBtn) logoutBtn.style.display = "inline-block";
      }else{
        setUser(null);
        if (status) status.textContent = "Not logged in.";
        if (logoutBtn) logoutBtn.style.display = "none";
      }

      updateHubStatus();
      startScheduleListener();
      startLiveListener();
    });
  }catch(e){
    fbReady = false;
  }
}
initFirebase();

// ---------- Real auth actions ----------
async function realSignup(){
  if (!fbReady){ setMsg("Firebase not configured yet.", false); return; }
  const email = emailEl.value.trim();
  const pass = passEl.value;
  try{
    await firebase.auth().createUserWithEmailAndPassword(email, pass);
    setMsg("Account created!", true);
  }catch(err){
    setMsg(err.message || "Signup failed.", false);
  }
}

async function realLogin(){
  if (!fbReady){ setMsg("Firebase not configured yet.", false); return; }
  const email = emailEl.value.trim();
  const pass = passEl.value;
  try{
    await firebase.auth().signInWithEmailAndPassword(email, pass);
    setMsg("Logged in!", true);
  }catch(err){
    setMsg(err.message || "Login failed.", false);
  }
}

async function googleSignIn(){
  if (!fbReady){ setMsg("Firebase not configured yet.", false); return; }
  try{
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebase.auth().signInWithPopup(provider);
    setMsg("Signed in with Google!", true);
  }catch(err){
    setMsg(err.message || "Google sign-in failed.", false);
  }
}

async function realReset(){
  if (!fbReady){ setMsg("Firebase not configured yet.", false); return; }
  const email = emailEl.value.trim();
  try{
    await firebase.auth().sendPasswordResetEmail(email);
    setMsg("Password reset email sent.", true);
  }catch(err){
    setMsg(err.message || "Reset failed.", false);
  }
}

async function realLogout(){
  if (!fbReady){ setMsg("Firebase not configured yet.", false); return; }
  await firebase.auth().signOut();
  setMsg("Logged out.", true);
}

if (signupBtn) signupBtn.addEventListener("click", realSignup);
if (loginBtn)  loginBtn.addEventListener("click", realLogin);
if (googleBtn) googleBtn.addEventListener("click", googleSignIn);
if (resetBtn)  resetBtn.addEventListener("click", realReset);
if (logoutBtn) logoutBtn.addEventListener("click", realLogout);
if (passEl) passEl.addEventListener("keydown", (e) => { if (e.key === "Enter") realLogin(); });


// ==============================
// ✅ SHARED HUB (schedule sharing)
// ==============================
const createHubBtn = document.getElementById("createHubBtn");
const joinHubBtn = document.getElementById("joinHubBtn");
const leaveHubBtn = document.getElementById("leaveHubBtn");
const hubCodeEl = document.getElementById("hubCode");
const hubStatus = document.getElementById("hubStatus");

function hubKey(){
  const uid = firebase.auth().currentUser?.uid;
  return uid ? `ap_hub_${uid}` : "ap_hub_guest";
}
function getHubId(){ return LS.get(hubKey(), ""); }
function setHubId(hubId){ LS.set(hubKey(), hubId); }

function updateHubStatus(){
  if (!hubStatus) return;
  const hubId = getHubId();
  hubStatus.textContent = hubId ? `Hub: ${hubId}` : "No hub selected";
}

function usingHub(){
  const hubId = getHubId();
  const user = firebase.auth().currentUser;
  return !!(fbReady && db && hubId && user);
}

async function createHub(){
  if (!fbReady || !db){ alert("Firebase not ready"); return; }
  const uid = firebase.auth().currentUser?.uid;
  if (!uid){ alert("Log in first"); return; }

  const ref = db.collection("hubs").doc();
  await ref.set({
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    members: [uid],
    name: "AP Learning Hub"
  });

  setHubId(ref.id);
  updateHubStatus();
  startScheduleListener();
  startLiveListener();
  alert("Hub created! Share this code: " + ref.id);
}

async function joinHub(code){
  if (!fbReady || !db){ alert("Firebase not ready"); return; }
  const uid = firebase.auth().currentUser?.uid;
  if (!uid){ alert("Log in first"); return; }

  const cleaned = (code || "").trim();
  if (!cleaned){ alert("Enter a hub code."); return; }

  const ref = db.collection("hubs").doc(cleaned);
  const snap = await ref.get();
  if (!snap.exists){ alert("Hub not found."); return; }

  await ref.update({
    members: firebase.firestore.FieldValue.arrayUnion(uid)
  });

  setHubId(ref.id);
  updateHubStatus();
  startScheduleListener();
  startLiveListener();
  alert("Joined hub!");
}

function leaveHub(){
  setHubId("");
  updateHubStatus();
  startScheduleListener();
  startLiveListener();
}

if (createHubBtn) createHubBtn.addEventListener("click", createHub);
if (joinHubBtn) joinHubBtn.addEventListener("click", () => joinHub(hubCodeEl?.value || ""));
if (leaveHubBtn) leaveHubBtn.addEventListener("click", leaveHub);

updateHubStatus();


// ---------- Schedule ----------
const sessTitle = document.getElementById("sessTitle");
const sessDate  = document.getElementById("sessDate");
const sessTime  = document.getElementById("sessTime");
const sessNotes = document.getElementById("sessNotes");
const sessVideo = document.getElementById("sessVideo"); // ✅ ADDED
const addSessionBtn = document.getElementById("addSessionBtn");
const clearSessionsBtn = document.getElementById("clearSessionsBtn");
const scheduleMsg = document.getElementById("scheduleMsg");
const sessionList = document.getElementById("sessionList");
const sessionEmpty = document.getElementById("sessionEmpty");

function sessionsKey(){ return currentUser ? `ap_sessions_${currentUser.email}` : "ap_sessions_guest"; }
function getSessionsLocal(){ return LS.get(sessionsKey(), []); }
function saveSessionsLocal(list){ LS.set(sessionsKey(), list); }

function setScheduleMsg(text, ok=false){
  if (!scheduleMsg) return;
  scheduleMsg.textContent = text;
  scheduleMsg.className = ok ? "msg ok" : "msg";
}

// ✅ Realtime Firestore schedule listener
let unsubSessions = null;

function startScheduleListener(){
  if (unsubSessions){ unsubSessions(); unsubSessions = null; }

  if (!usingHub()){
    renderSessionsFromData(getSessionsLocal().map((s, idx) => ({...s, _localId: idx})));
    return;
  }

  const hubId = getHubId();
  unsubSessions = db.collection("hubs").doc(hubId)
    .collection("sessions")
    .orderBy("dateTime", "asc")
    .onSnapshot((qs) => {
      const sessions = [];
      qs.forEach(doc => sessions.push({ id: doc.id, ...doc.data() }));
      renderSessionsFromData(sessions);
      renderHomeWidgets();
    }, (err) => {
      console.error(err);
      setScheduleMsg("Schedule error (check Firestore rules + hub membership).", false);
    });
}

function renderSessionsFromData(sessions){
  if (!sessionList) return;

  sessionList.innerHTML = "";
  if (sessionEmpty) sessionEmpty.style.display = sessions.length ? "none" : "block";

  sessions.forEach((s) => {
    const div = document.createElement("div");
    div.className = "item";

    const idAttr = (s.id != null) ? `data-id="${s.id}"` : `data-local="${s._localId}"`;

    const videoHtml = s.videoUrl
      ? `<div class="meta">Video: <a href="${escapeHtml(s.videoUrl)}" target="_blank" rel="noopener">Open</a></div>`
      : "";

    div.innerHTML = `
      <div>
        <strong>${escapeHtml(s.title || "")}</strong>
        <div class="meta">${escapeHtml(s.date || "")} at ${escapeHtml(s.time || "")}</div>
        ${videoHtml}
        ${s.notes ? `<div class="meta">${escapeHtml(s.notes)}</div>` : ""}
      </div>
      <div class="row">
        <button class="btn primary" data-action="start-live" ${idAttr} type="button">Start live</button>
        <button class="btn ghost" data-action="delete-session" ${idAttr} type="button">Delete</button>
      </div>
    `;
    sessionList.appendChild(div);
  });
}

function safeUrl(u){
  const s = String(u || "").trim();
  if (!s) return "";
  // allow http/https only (basic safety)
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

async function addSession(){
  const title = (sessTitle?.value || "").trim();
  const date = sessDate?.value || "";
  const time = sessTime?.value || "";
  const notes = (sessNotes?.value || "").trim();
  const videoUrl = safeUrl(sessVideo?.value || "");

  if (!title || !date || !time){
    setScheduleMsg("Please enter title, date, and time.", false);
    return;
  }

  if (usingHub()){
    const hubId = getHubId();
    const dateTime = new Date(`${date}T${time}:00`);
    await db.collection("hubs").doc(hubId).collection("sessions").add({
      title, date, time, notes,
      videoUrl,
      dateTime: firebase.firestore.Timestamp.fromDate(dateTime),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setScheduleMsg("Session added (shared)!", true);
  }else{
    const sessions = getSessionsLocal();
    sessions.push({ title, date, time, notes, videoUrl });
    saveSessionsLocal(sessions);
    setScheduleMsg("Session added (local)!", true);
    renderAll();
  }

  if (sessTitle) sessTitle.value = "";
  if (sessNotes) sessNotes.value = "";
  if (sessVideo) sessVideo.value = "";
}

async function clearSessions(){
  if (usingHub()){
    const hubId = getHubId();
    const qs = await db.collection("hubs").doc(hubId).collection("sessions").get();
    const batch = db.batch();
    qs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    setScheduleMsg("All sessions cleared (shared).", true);
  }else{
    saveSessionsLocal([]);
    setScheduleMsg("All sessions cleared (local).", true);
    renderAll();
  }
}

async function deleteSessionShared(id){
  const hubId = getHubId();
  await db.collection("hubs").doc(hubId).collection("sessions").doc(id).delete();
}
function deleteSessionLocal(localIdx){
  const sessions = getSessionsLocal();
  sessions.splice(localIdx, 1);
  saveSessionsLocal(sessions);
  renderAll();
}

if (addSessionBtn) addSessionBtn.addEventListener("click", addSession);
if (clearSessionsBtn) clearSessionsBtn.addEventListener("click", clearSessions);

if (sessionList){
  sessionList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const sharedId = btn.dataset.id;
    const localId = btn.dataset.local;

    if (action === "delete-session"){
      if (sharedId) await deleteSessionShared(sharedId);
      else if (localId != null) deleteSessionLocal(Number(localId));
    }

    if (action === "start-live"){
      if (!usingHub()){
        alert("To start live sessions, log in and create/join a hub first.");
        return;
      }
      if (sharedId) await startLiveSession(sharedId);
      else alert("Live sessions only work for shared hub sessions.");
    }
  });
}


// ==============================
// ✅ LIVE SESSIONS (hub realtime)
// ==============================
const liveList = document.getElementById("liveList");
const liveEmpty = document.getElementById("liveEmpty");
let unsubLive = null;

function renderLive(lives){
  if (!liveList) return;
  liveList.innerHTML = "";

  if (liveEmpty) liveEmpty.style.display = lives.length ? "none" : "block";

  lives.forEach(l => {
    const div = document.createElement("div");
    div.className = "item";
    const count = l.participants ? Object.keys(l.participants).length : 0;

    const videoBtn = l.videoUrl
      ? `<button class="btn ghost" data-action="open-video" data-url="${escapeHtml(l.videoUrl)}" type="button">Open video</button>`
      : "";

    div.innerHTML = `
      <div style="flex:1;">
        <strong>${escapeHtml(l.title || "Live Study")}</strong>
        <div class="meta">Participants: ${count}</div>
        ${l.videoUrl ? `<div class="meta">Video set ✅</div>` : `<div class="meta">No video link</div>`}
      </div>
      <div class="row">
        <button class="btn primary" data-action="join-live" data-id="${l.id}" type="button">Join</button>
        ${videoBtn}
        <button class="btn danger" data-action="end-live" data-id="${l.id}" type="button">End</button>
      </div>
    `;
    liveList.appendChild(div);
  });
}

function startLiveListener(){
  if (unsubLive){ unsubLive(); unsubLive = null; }

  if (!usingHub()){
    renderLive([]);
    return;
  }

  const hubId = getHubId();
  unsubLive = db.collection("hubs").doc(hubId)
    .collection("liveSessions")
    .where("active", "==", true)
    .onSnapshot((qs) => {
      const lives = [];
      qs.forEach(doc => lives.push({ id: doc.id, ...doc.data() }));
      renderLive(lives);
    }, (err) => {
      console.error(err);
    });
}

async function startLiveSession(sessionId){
  const hubId = getHubId();
  const user = firebase.auth().currentUser;
  if (!hubId || !user) return;

  const sRef = db.collection("hubs").doc(hubId).collection("sessions").doc(sessionId);
  const sSnap = await sRef.get();
  if (!sSnap.exists) return;

  const s = sSnap.data();

  const liveRef = db.collection("hubs").doc(hubId).collection("liveSessions").doc();
  await liveRef.set({
    active: true,
    title: s.title || "Study Session",
    hostUid: user.uid,
    startedAt: firebase.firestore.FieldValue.serverTimestamp(),
    videoUrl: safeUrl(s.videoUrl || ""), // ✅ pass session video link into live
    participants: { [user.uid]: user.email || "host" }
  });

  alert("Live session started!");
}

async function joinLiveSession(liveId){
  const hubId = getHubId();
  const user = firebase.auth().currentUser;
  if (!hubId || !user) return;

  const ref = db.collection("hubs").doc(hubId).collection("liveSessions").doc(liveId);
  await ref.update({
    [`participants.${user.uid}`]: user.email || "member"
  });
}

async function endLiveSession(liveId){
  const hubId = getHubId();
  const user = firebase.auth().currentUser;
  if (!hubId || !user) return;

  const ref = db.collection("hubs").doc(hubId).collection("liveSessions").doc(liveId);
  const snap = await ref.get();
  if (!snap.exists) return;

  if (snap.data().hostUid !== user.uid){
    alert("Only the host can end this session.");
    return;
  }

  await ref.update({
    active: false,
    endedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.dataset.action === "join-live") await joinLiveSession(btn.dataset.id);
  if (btn.dataset.action === "end-live") await endLiveSession(btn.dataset.id);

  if (btn.dataset.action === "open-video"){
    const url = btn.dataset.url || "";
    if (url) window.open(url, "_blank", "noopener");
  }
});


// ---------- Dashboard (Tasks) ----------
const taskText = document.getElementById("taskText");
const taskClass = document.getElementById("taskClass");
const taskDue = document.getElementById("taskDue");
const addTaskBtn = document.getElementById("addTaskBtn");
const clearTasksBtn = document.getElementById("clearTasksBtn");
const dashMsg = document.getElementById("dashMsg");

const taskList = document.getElementById("taskList");
const taskEmpty = document.getElementById("taskEmpty");
const taskProgress = document.getElementById("taskProgress");
const taskProgressText = document.getElementById("taskProgressText");
const streakPill = document.getElementById("streakPill");

function tasksKey(){ return currentUser ? `ap_tasks_${currentUser.email}` : "ap_tasks_guest"; }
function streakKey(){ return currentUser ? `ap_streak_${currentUser.email}` : "ap_streak_guest"; }

function getTasks(){ return LS.get(tasksKey(), []); }
function saveTasks(list){ LS.set(tasksKey(), list); }

function getStreak(){ return LS.get(streakKey(), {count:0, lastDone:""}); }
function saveStreak(s){ LS.set(streakKey(), s); }

function setDashMsg(text, ok=false){
  if (!dashMsg) return;
  dashMsg.textContent = text;
  dashMsg.className = ok ? "msg ok" : "msg";
}

function addTask(){
  const text = (taskText?.value || "").trim();
  const cls = taskClass?.value || "Other";
  const due = taskDue?.value || "";

  if (!text){
    setDashMsg("Type a task first.", false);
    return;
  }

  const tasks = getTasks();
  tasks.push({ text, cls, due, done:false, created: new Date().toISOString() });
  saveTasks(tasks);

  taskText.value = "";
  taskDue.value = "";
  setDashMsg("Task added!", true);
  renderAll();
}

function clearTasks(){
  saveTasks([]);
  setDashMsg("All tasks cleared.", true);
  renderAll();
}

function isoDay(d){ return d.toISOString().slice(0,10); }

function bumpDoneDate(idx){
  const tasks = getTasks();
  const t = tasks[idx];
  if (!t) return;

  if (t.done && !t.doneDate){
    t.doneDate = isoDay(new Date());
    saveTasks(tasks);
  }
  if (!t.done){
    t.doneDate = "";
    saveTasks(tasks);
  }
}

function bumpStreak(){
  const s = getStreak();
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);

  if (s.lastDone === todayStr) return;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0,10);

  if (s.lastDone === yStr) s.count += 1;
  else s.count = 1;

  s.lastDone = todayStr;
  saveStreak(s);
}

function toggleTask(idx){
  const tasks = getTasks();
  if (!tasks[idx]) return;
  tasks[idx].done = !tasks[idx].done;
  saveTasks(tasks);

  bumpDoneDate(idx);
  if (tasks[idx].done) bumpStreak();
  renderAll();
}

function deleteTask(idx){
  const tasks = getTasks();
  tasks.splice(idx, 1);
  saveTasks(tasks);
  renderAll();
}

function renderTasks(){
  if (!taskList) return;

  const tasks = getTasks();
  taskList.innerHTML = "";

  if (taskEmpty) taskEmpty.style.display = tasks.length ? "none" : "block";

  tasks.forEach((t, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div style="flex:1;">
        <strong>${escapeHtml(t.text)}</strong>
        <div class="meta">${escapeHtml(t.cls)}${t.due ? " • due " + escapeHtml(t.due) : ""}</div>
      </div>
      <div class="row">
        <button class="btn ${t.done ? "ghost" : "primary"}" data-action="toggle-task" data-idx="${idx}" type="button">
          ${t.done ? "Undo" : "Done"}
        </button>
        <button class="btn ghost" data-action="delete-task" data-idx="${idx}" type="button">Delete</button>
      </div>
    `;
    taskList.appendChild(div);
  });

  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct = total ? Math.round((done/total)*100) : 0;

  if (taskProgress) taskProgress.style.width = pct + "%";
  if (taskProgressText) taskProgressText.textContent = `${done} / ${total} done (${pct}%)`;

  const s = getStreak();
  if (streakPill) streakPill.textContent = `Streak: ${s.count}`;
}

if (addTaskBtn) addTaskBtn.addEventListener("click", addTask);
if (clearTasksBtn) clearTasksBtn.addEventListener("click", clearTasks);

if (taskList){
  taskList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    if (btn.dataset.action === "toggle-task") toggleTask(idx);
    if (btn.dataset.action === "delete-task") deleteTask(idx);
  });
}


// ---------- Resources ----------
const resSearch = document.getElementById("resSearch");
const resFilter = document.getElementById("resFilter");
const resList = document.getElementById("resList");
const resEmpty = document.getElementById("resEmpty");

// ✅ Classes aligned to your dropdown labels
const DEFAULT_RESOURCES = [
  // Calc
  {cls:"Calc AB", title:"AP Calc AB (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-calculus-ab"},
  {cls:"Calc AB", title:"Calc AB (Khan Academy)", url:"https://www.khanacademy.org/math/ap-calculus-ab"},
  {cls:"Calc BC", title:"AP Calc BC (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-calculus-bc"},
  {cls:"Calc BC", title:"Calc BC (Khan Academy)", url:"https://www.khanacademy.org/math/ap-calculus-bc"},

  // Physics
  {cls:"Physics 1", title:"AP Physics 1 (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-physics-1"},
  {cls:"Physics 2", title:"AP Physics 2 (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-physics-2"},
  {cls:"Physics 2", title:"AP Physics 2 (Khan Academy)", url:"https://www.khanacademy.org/science/ap-physics-2"},
  {cls:"Physics C", title:"AP Physics C (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-physics-c-mechanics"},
  {cls:"Physics C", title:"AP Physics C: E&M (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-physics-c-electricity-and-magnetism"},

  // Science
  {cls:"Chem", title:"AP Chemistry (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-chemistry"},
  {cls:"Chem", title:"AP Chemistry (Khan Academy)", url:"https://www.khanacademy.org/science/ap-chemistry"},
  {cls:"Bio", title:"AP Biology (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-biology"},
  {cls:"Bio", title:"AP Biology (Khan Academy)", url:"https://www.khanacademy.org/science/ap-biology"},

  // History / Social Studies
  {cls:"APUSH", title:"AP U.S. History (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-united-states-history"},
  {cls:"Euro", title:"AP European History (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-european-history"},
  {cls:"Gov", title:"AP U.S. Government (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-united-states-government-and-politics"},
  {cls:"Macro", title:"AP Macroeconomics (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-macroeconomics"},
  {cls:"Micro", title:"AP Microeconomics (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-microeconomics"},
  {cls:"HUGE", title:"AP Human Geography (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-human-geography"},

  // English
  {cls:"Lang", title:"AP English Language (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-english-language-and-composition"},
  {cls:"Lit", title:"AP English Literature (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-english-literature-and-composition"},

  // Capstone
  {cls:"Seminar", title:"AP Seminar (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-seminar"},
  {cls:"Research", title:"AP Research (College Board)", url:"https://apstudents.collegeboard.org/courses/ap-research"}
];

function resourcesKey(){ return currentUser ? `ap_resources_${currentUser.email}` : "ap_resources_guest"; }

function mergeResources(saved, defaults){
  const out = [];
  const seen = new Set();

  (saved || []).forEach(r => {
    const key = (r.url || "") + "||" + (r.title || "");
    if (!seen.has(key)){
      seen.add(key);
      out.push(r);
    }
  });

  (defaults || []).forEach(r => {
    const key = (r.url || "") + "||" + (r.title || "");
    if (!seen.has(key)){
      seen.add(key);
      out.push(r);
    }
  });

  return out;
}

function getResources(){
  const key = resourcesKey();
  const saved = LS.get(key, null);
  if (!saved) return DEFAULT_RESOURCES;
  return mergeResources(saved, DEFAULT_RESOURCES);
}
function saveResources(list){ LS.set(resourcesKey(), list); }

function renderResources(){
  if (!resList) return;
  const q = (resSearch?.value || "").toLowerCase().trim();
  const filt = resFilter?.value || "All";

  const resources = getResources().filter(r => {
    const matchClass = (filt === "All") || (r.cls === filt);
    const matchText = !q || (r.title.toLowerCase().includes(q) || r.cls.toLowerCase().includes(q));
    return matchClass && matchText;
  });

  resList.innerHTML = "";
  if (resEmpty) resEmpty.style.display = resources.length ? "none" : "block";

  resources.forEach(r => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div style="flex:1;">
        <strong>${escapeHtml(r.title)}</strong>
        <div class="meta">${escapeHtml(r.cls)}</div>
      </div>
      <div class="row">
        <a class="btn ghost" href="${r.url}" target="_blank" rel="noopener">Open</a>
      </div>
    `;
    resList.appendChild(div);
  });
}

if (resSearch) resSearch.addEventListener("input", renderResources);
if (resFilter) resFilter.addEventListener("change", renderResources);


// ---------- Home widgets ----------
const userPill = document.getElementById("userPill");
const todayFocus = document.getElementById("todayFocus");
const upcomingSession = document.getElementById("upcomingSession");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

function formatDateTime(dateStr, timeStr){
  if (!dateStr || !timeStr) return "";
  return `${dateStr} at ${timeStr}`;
}

function renderHomeWidgets(){
  if (userPill){
    userPill.textContent = currentUser ? `Logged in: ${currentUser.email}` : "Not logged in";
  }

  const tasks = getTasks();
  const nextTask = tasks.find(t => !t.done);
  if (todayFocus){
    todayFocus.textContent = nextTask ? `${nextTask.text} (${nextTask.cls})` : "No tasks — add one in Dashboard!";
  }

  // home uses local schedule as a simple preview (shared schedule shows in schedule tab)
  const sessions = getSessionsLocal()
    .slice()
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
  const up = sessions[0];
  if (upcomingSession){
    upcomingSession.textContent = up ? `${up.title} • ${formatDateTime(up.date, up.time)}` : "Add a session in Schedule.";
  }

  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct = total ? Math.round((done/total)*100) : 0;
  if (progressBar) progressBar.style.width = pct + "%";
  if (progressText) progressText.textContent = `${pct}% complete`;
}

// ---------- Utilities ----------
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}


// ---------- Charts ----------
function daysBack(n){
  const arr = [];
  const d = new Date();
  d.setHours(0,0,0,0);
  for (let i=n-1; i>=0; i--){
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    arr.push(isoDay(x));
  }
  return arr;
}

const studyMinutesEl = document.getElementById("studyMinutes");
const addStudyBtn = document.getElementById("addStudyBtn");
const clearStudyBtn = document.getElementById("clearStudyBtn");
const studyTotalText = document.getElementById("studyTotalText");

function studyKey(){ return currentUser ? `ap_study_${currentUser.email}` : "ap_study_guest"; }
function getStudy(){ return LS.get(studyKey(), {}); }
function saveStudy(obj){ LS.set(studyKey(), obj); }

function drawBarChart(canvas, labels, values){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const pad = 28;
  const maxVal = Math.max(1, ...values);
  const barW = (w - pad*2) / values.length;

  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h-pad);
  ctx.lineTo(w-pad, h-pad);
  ctx.stroke();

  for (let i=0; i<values.length; i++){
    const v = values[i];
    const x = pad + i*barW + 6;
    const bh = Math.round((h - pad*2) * (v / maxVal));
    const y = (h - pad) - bh;

    ctx.fillRect(x, y, Math.max(6, barW-12), bh);

    ctx.font = "11px Arial";
    ctx.fillText(labels[i], x, h - 10);
  }
}

function renderCharts(){
  const studyChart = document.getElementById("studyChart");
  const tasksChart = document.getElementById("tasksChart");

  const days = daysBack(7);
  const short = days.map(d => d.slice(5));

  const study = getStudy();
  const mins = days.map(d => Number(study[d] || 0));
  drawBarChart(studyChart, short, mins);
  if (studyTotalText){
    const total = mins.reduce((a,b)=>a+b,0);
    studyTotalText.textContent = `Total this week: ${total}`;
  }

  const tasks = getTasks();
  const doneCounts = days.map(d =>
    tasks.filter(t => t.done && t.doneDate === d).length
  );
  drawBarChart(tasksChart, short, doneCounts);
}

if (addStudyBtn){
  addStudyBtn.addEventListener("click", () => {
    const val = Number((studyMinutesEl?.value || "0").trim());
    if (!val || val < 0) return;

    const obj = getStudy();
    const d = isoDay(new Date());
    obj[d] = Number(obj[d] || 0) + val;
    saveStudy(obj);

    if (studyMinutesEl) studyMinutesEl.value = "";
    renderAll();
  });
}
if (clearStudyBtn){
  clearStudyBtn.addEventListener("click", () => {
    saveStudy({});
    renderAll();
  });
}


// ---------- Grades (assignment tracker) ----------
const gradeClassEl = document.getElementById("gradeClass");
const wSummEl = document.getElementById("wSumm");
const wFormEl = document.getElementById("wForm");
const saveWeightsBtn = document.getElementById("saveWeightsBtn");
const weightsStatus = document.getElementById("weightsStatus");

const aNameEl = document.getElementById("aName");
const aCatEl = document.getElementById("aCat");
const aScoreEl = document.getElementById("aScore");
const addAssignBtn = document.getElementById("addAssignBtn");
const clearAssignBtn = document.getElementById("clearAssignBtn");

const assignList = document.getElementById("assignList");
const assignEmpty = document.getElementById("assignEmpty");
const currentGradePill = document.getElementById("currentGradePill");
const gradeMsg = document.getElementById("gradeMsg");

const targetGradeEl = document.getElementById("targetGrade");
const needNextBtn = document.getElementById("needNextBtn");
const needNextText = document.getElementById("needNextText");

function gradeKey(){
  const who = currentUser ? currentUser.email : "guest";
  return `ap_grades_${who}`;
}
function getGradeData(){ return LS.get(gradeKey(), {}); }
function saveGradeData(data){ LS.set(gradeKey(), data); }

function setGradeMsg(text, ok=false){
  if (!gradeMsg) return;
  gradeMsg.textContent = text;
  gradeMsg.className = ok ? "msg ok" : "msg";
}

function getClassBlock(cls){
  const data = getGradeData();
  if (!data[cls]) data[cls] = { weights:{summ:0, form:0}, assigns:[] };
  return { data, block: data[cls] };
}

function calcCurrentGrade(block){
  const ws = Number(block.weights.summ || 0);
  const wf = Number(block.weights.form || 0);
  const sumW = ws + wf;

  const summScores = block.assigns.filter(a=>a.cat==="summ").map(a=>Number(a.score));
  const formScores = block.assigns.filter(a=>a.cat==="form").map(a=>Number(a.score));
  const avg = (arr)=> arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;

  const summAvg = avg(summScores);
  const formAvg = avg(formScores);

  if (sumW === 0) return null;

  let total = 0;
  let used = 0;

  if (summAvg !== null){ total += summAvg * ws; used += ws; }
  if (formAvg !== null){ total += formAvg * wf; used += wf; }

  if (used === 0) return null;
  return total / used;
}

function renderGrades(){
  if (!gradeClassEl) return;

  const cls = gradeClassEl.value;
  const { data, block } = getClassBlock(cls);

  if (wSummEl) wSummEl.value = block.weights.summ || "";
  if (wFormEl) wFormEl.value = block.weights.form || "";

  if (weightsStatus){
    const s = Number(block.weights.summ || 0);
    const f = Number(block.weights.form || 0);
    weightsStatus.textContent = (s+f===100) ? `Weights: ${s}/${f}` : `Weights: ${s}+${f} (should = 100)`;
  }

  if (assignList){
    assignList.innerHTML = "";
    if (assignEmpty) assignEmpty.style.display = block.assigns.length ? "none" : "block";

    block.assigns.forEach((a, idx) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div style="flex:1;">
          <strong>${escapeHtml(a.name)}</strong>
          <div class="meta">${a.cat === "summ" ? "Summative" : "Formative"} • ${a.score}%</div>
        </div>
        <div class="row">
          <button class="btn ghost" data-action="del-assign" data-idx="${idx}" type="button">Delete</button>
        </div>
      `;
      assignList.appendChild(div);
    });

    assignList.onclick = (e) => {
      const btn = e.target.closest("button");
      if (!btn || btn.dataset.action !== "del-assign") return;
      const idx = Number(btn.dataset.idx);
      block.assigns.splice(idx, 1);
      data[cls] = block;
      saveGradeData(data);
      renderGrades();
      renderHomeWidgets();
    };
  }

  const current = calcCurrentGrade(block);
  if (currentGradePill){
    currentGradePill.textContent = current === null ? "Current: --" : `Current: ${current.toFixed(1)}%`;
  }
}

if (gradeClassEl) gradeClassEl.addEventListener("change", () => { setGradeMsg("", true); renderGrades(); });

if (saveWeightsBtn){
  saveWeightsBtn.addEventListener("click", () => {
    const cls = gradeClassEl.value;
    const s = Number(wSummEl?.value || 0);
    const f = Number(wFormEl?.value || 0);

    if (s + f !== 100){
      setGradeMsg("Weights should add to 100.", false);
      return;
    }

    const { data, block } = getClassBlock(cls);
    block.weights = { summ:s, form:f };
    data[cls] = block;
    saveGradeData(data);
    setGradeMsg("Weights saved!", true);
    renderGrades();
  });
}

if (addAssignBtn){
  addAssignBtn.addEventListener("click", () => {
    const cls = gradeClassEl.value;
    const name = (aNameEl?.value || "").trim();
    const cat = aCatEl?.value || "summ";
    const score = Number(aScoreEl?.value || "");

    if (!name || Number.isNaN(score)){
      setGradeMsg("Enter a name and score.", false);
      return;
    }
    if (score < 0 || score > 100){
      setGradeMsg("Score must be 0–100.", false);
      return;
    }

    const { data, block } = getClassBlock(cls);
    block.assigns.push({ name, cat, score });
    data[cls] = block;
    saveGradeData(data);

    if (aNameEl) aNameEl.value = "";
    if (aScoreEl) aScoreEl.value = "";
    setGradeMsg("Assignment added!", true);
    renderGrades();
    renderHomeWidgets();
  });
}

if (clearAssignBtn){
  clearAssignBtn.addEventListener("click", () => {
    const cls = gradeClassEl.value;
    const { data, block } = getClassBlock(cls);
    block.assigns = [];
    data[cls] = block;
    saveGradeData(data);
    setGradeMsg("Cleared this class.", true);
    renderGrades();
  });
}

if (needNextBtn){
  needNextBtn.addEventListener("click", () => {
    const cls = gradeClassEl.value;
    const target = Number(targetGradeEl?.value || "");
    if (Number.isNaN(target)){
      needNextText.textContent = "Enter a target.";
      return;
    }

    const { block } = getClassBlock(cls);
    const ws = Number(block.weights.summ || 0);
    const wf = Number(block.weights.form || 0);

    if (ws + wf !== 100){
      needNextText.textContent = "Set weights first.";
      return;
    }

    const summ = block.assigns.filter(a=>a.cat==="summ").map(a=>Number(a.score));
    const form = block.assigns.filter(a=>a.cat==="form").map(a=>Number(a.score));
    const avg = (arr)=> arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;

    const summAvg = avg(summ);
    const formAvg = avg(form);

    const n = summ.length;
    const baseForm = (formAvg === null ? null : formAvg);

    if (baseForm === null && n===0){
      needNextText.textContent = "Add at least one grade first (summ or form).";
      return;
    }

    if (ws === 0){
      needNextText.textContent = "Summative weight is 0 — next summ won’t matter.";
      return;
    }
    const desiredSummAvg = (100*target - wf*(baseForm ?? 0)) / ws;

    let x;
    if (n === 0){
      x = desiredSummAvg;
    }else{
      const currentSummAvg = summAvg ?? 0;
      x = desiredSummAvg*(n+1) - currentSummAvg*n;
    }

    needNextText.textContent = `If your next Summative is a ${x.toFixed(1)}%, your grade will be about ${target.toFixed(1)}%.`;
  });
}


// ==============================
// ✅ Semester / Year Grade Calculator (ADDED)
// ==============================
const gradeModeEl = document.getElementById("gradeMode");
const weightAEl = document.getElementById("weightA");
const weightBEl = document.getElementById("weightB");
const gradeAEl  = document.getElementById("gradeA");
const gradeBEl  = document.getElementById("gradeB");
const labelAEl  = document.getElementById("labelA");
const labelBEl  = document.getElementById("labelB");
const calcGradeBtn = document.getElementById("calcGradeBtn");
const calcResultPill = document.getElementById("calcResultPill");
const calcGradeText = document.getElementById("calcGradeText");

function updateCalcLabels(){
  if (!gradeModeEl) return;
  const mode = gradeModeEl.value;
  if (mode === "semester"){
    if (labelAEl) labelAEl.textContent = "Q1 grade (%)";
    if (labelBEl) labelBEl.textContent = "Q2 grade (%)";
  } else {
    if (labelAEl) labelAEl.textContent = "Sem 1 grade (%)";
    if (labelBEl) labelBEl.textContent = "Sem 2 grade (%)";
  }
}

function runCalc(){
  if (!calcGradeText || !calcResultPill) return;

  const a = Number(gradeAEl?.value);
  const b = Number(gradeBEl?.value);
  const wa = Number(weightAEl?.value);
  const wb = Number(weightBEl?.value);

  if ([a,b,wa,wb].some(x => Number.isNaN(x))){
    calcGradeText.textContent = "Enter both grades + both weights.";
    calcResultPill.textContent = "--";
    return;
  }
  if (wa + wb !== 100){
    calcGradeText.textContent = "Weights must add to 100.";
    calcResultPill.textContent = "--";
    return;
  }
  if (a < 0 || a > 100 || b < 0 || b > 100){
    calcGradeText.textContent = "Grades must be 0–100.";
    calcResultPill.textContent = "--";
    return;
  }

  const result = (a*wa + b*wb) / (wa + wb);
  calcResultPill.textContent = result.toFixed(1) + "%";
  calcGradeText.textContent = "Done.";
}

if (gradeModeEl) gradeModeEl.addEventListener("change", updateCalcLabels);
if (calcGradeBtn) calcGradeBtn.addEventListener("click", runCalc);
updateCalcLabels();


// ---------- Render all ----------
function renderAll(){
  renderTasks();
  renderResources();
  renderHomeWidgets();
  renderCharts();
  renderGrades();
  startScheduleListener();
  startLiveListener();
}

renderAll();
