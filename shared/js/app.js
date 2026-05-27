const API_BASE = location.protocol === 'file:'
  ? 'http://127.0.0.1/FR-2/api'
  : (/\/(parent|driver|guard)\//.test(location.pathname) ? '../api' : 'api');
const DEFAULT_DRIVER_ID = 0;
const DEFAULT_PICKUP = '123 Oak Street, Apartment 4B';
let currentRating = 0;
let selectedTripType = localStorage.getItem('rideguard_trip_type') || 'home_to_school';
let driverMap = null;
let driverMarker = null;
let driverRoutePolyline = null;
let driverWatchId = null;
let driverSimId = null;
let driverRouteDestination = null;
let selectedSignupRole = 'parent';
let parentMap = null;
let lastDriverChildName = 'Emma Johnson';
let originalRegisterStepTwo = '';
let lastScannedQrCode = '';
let qrCameraStream = null;
let qrScanTimer = null;

function setSelectedTripType(type){
  selectedTripType = type || 'home_to_school';
  localStorage.setItem('rideguard_trip_type', selectedTripType);
}

function assetPath(path){
  return location.pathname.includes('/parent/') || location.pathname.includes('/driver/') || location.pathname.includes('/guard/')
    ? `../shared/assets/${path}`
    : `shared/assets/${path}`;
}

function replaceBrandLogos(){
  const logoSrc = assetPath('rideguard-logo.png');
  document.querySelectorAll('.app-header').forEach(header=>{
    const first = header.firstElementChild;
    if(first?.classList?.contains('logo-mark')) return;
    if(first && first.tagName.toLowerCase() === 'svg'){
      first.outerHTML = `<img class="logo-mark" src="${logoSrc}" alt="RideGuard logo">`;
    }
  });
  document.querySelectorAll('.screen[style*="blue-grad"] svg.pulse').forEach(svg=>{
    svg.outerHTML = `<img class="landing-logo pulse" src="${logoSrc}" alt="RideGuard logo">`;
  });
}

function go(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const t=document.getElementById(id);
  if(t){t.classList.add('active');t.scrollTop=0;}
  if(id === 's-reg2') renderRegistrationStepTwo();
  if(id === 's-alerts' && !window._rgOpeningUtility) openAlerts(false).catch(err=>toast(err.message,true));
  if(id === 's-profile' && !window._rgOpeningUtility) openProfile(false).catch(err=>toast(err.message,true));
  if(id === 's-parent-trip-history') openParentTripHistory(false).catch(err=>toast(err.message,true));
  if(id === 's-dashboard') refreshParentView().catch(err=>toast(err.message,true));
  if(id === 's-trip-monitor') openTripMonitor().catch(err=>toast(err.message,true));
  if(id === 's-driver-dash') refreshDriverView().catch(err=>toast(err.message,true));
  if(id === 's-trip-records') refreshDriverRecords().catch(err=>toast(err.message,true));
  if(id === 's-guard-scans') refreshGuardScans().catch(err=>toast(err.message,true));
  if(id === 's-guard-history') refreshGuardHistory().catch(err=>toast(err.message,true));
  if(id === 's-trip-request' || id === 's-trip-request-loading') refreshDriverView().catch(err=>toast(err.message,true));
  if(id === 's-active-trip') showActiveTripMap().catch(err=>toast(err.message,true));
}

async function refreshDriverRecords(){
  if(!document.getElementById('s-trip-records')) return;
  const driverId = activeDriverId();
  if(!driverId) return toast('Login as driver first', true);
  const trips = await loadDriverTrips(driverId);
  renderTripRecords(trips);
}

function renderTripRecords(trips = []){
  const screen = document.getElementById('s-trip-records');
  if(!screen) return;
  const list = screen.querySelector('.scroll-content');
  if(!list) return;
  if(!trips.length) {
    list.innerHTML = '<div class="rg-muted-state">No trips recorded yet.</div>';
    return;
  }
  list.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:14px">Trip Records</h2>
    ${trips.map(t=>`
      <div class="card card-shadow" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px"><div><div style="font-size:14px;font-weight:800">${t.student_first_name} ${t.student_last_name}</div><div style="font-size:12px;color:var(--text2)">${tripLabel(t.trip_type)} - ${formatTime(t.pickup_time)}</div></div>${statusBadge(t.status)}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">${t.pickup_address} → ${t.dropoff_address}</div>
      </div>
    `).join('')}
  `;
}

function renderParentTripHistory(trips = []){
  const list = document.querySelector('#s-parent-trip-history .scroll-content');
  if(!list) return;
  list.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:14px">Trip History</h2>
    ${trips.length ? trips.map(t=>`
      <div class="card card-shadow" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <div>
            <div style="font-size:14px;font-weight:800">${t.student_first_name} ${t.student_last_name}</div>
            <div style="font-size:12px;color:var(--text2)">${tripLabel(t.trip_type)} - ${formatTime(t.pickup_time)}</div>
          </div>
          ${statusBadge(t.status)}
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">${t.pickup_address} -> ${t.dropoff_address}</div>
      </div>`).join('') : '<div class="rg-muted-state">No trips recorded yet.</div>'}
  `;
}

function renderGuardTripHistory(scans = []){
  const list = document.querySelector('#s-guard-history .scroll-content');
  if(!list) return;
  list.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:14px">Trip History</h2>
    ${scans.length ? scans.map(s=>{
      const time = s.scanned_at ? new Date(s.scanned_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      return `<div class="card card-shadow" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <div style="font-size:14px;font-weight:800">${s.student_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student'}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px">${tripLabel(s.phase || 'school_to_home')}</div>
          </div>
          <span class="badge ${s.result === 'verified' ? 'badge-green' : 'badge-yellow'}">${s.result || 'logged'}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">${time}</div>
      </div>`;
    }).join('') : '<div class="rg-muted-state">No guard trip history yet.</div>'}
  `;
}

// Real API layer: call PHP endpoints using fetch and return parsed JSON.
async function api(path, options = {}){
  const base = API_BASE.replace(/\/$/, '');
  const url = path.startsWith('http') ? path : (base + '/' + path.replace(/^\//, ''));
  const fetchOpts = {
    method: options.method || 'GET',
    headers: Object.assign({'Accept':'application/json'}, options.headers || {})
  };
  if (fetchOpts.method !== 'GET' && options.body !== undefined) {
    fetchOpts.headers['Content-Type'] = fetchOpts.headers['Content-Type'] || 'application/json';
    fetchOpts.body = options.body;
  }

  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (e) {
    throw new Error(`Could not reach RideGuard API at ${url}. Open the app through http://127.0.0.1/FR-2/ or start Apache in XAMPP.`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error('Invalid JSON response from API'); }

  if (!res.ok) {
    const err = data && data.error ? data.error : res.statusText || 'Request failed';
    throw new Error(err);
  }

  if (data && data.ok === false) {
    throw new Error(data.error || 'API returned an error');
  }

  return data || {};
}

function getInput(screenId, placeholder){
  const screen = document.getElementById(screenId);
  if(!screen) return '';
  const input = Array.from(screen.querySelectorAll('input, textarea')).find(el => (el.placeholder || '').toLowerCase() === placeholder.toLowerCase());
  return input ? input.value.trim() : '';
}

function calculateAge(dateOfBirth){
  if(!dateOfBirth) return '';
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if(Number.isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if(monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function toast(message, isError = false){
  let el = document.getElementById('rg-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'rg-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;max-width:320px;padding:10px 14px;border-radius:10px;color:#fff;font:700 12px DM Sans,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.background = isError ? '#ef4444' : '#15803d';
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(()=>{ el.style.opacity = '0'; }, 2600);
}

function currentUser(defaultUser = null){
  try { return JSON.parse(localStorage.getItem('rideguard_user')) || defaultUser; }
  catch { return defaultUser; }
}

function storeUser(user){
  const children = user.children || (user.child ? [user.child] : []);
  user.children = children;
  user.child = selectedChild(user) || children[0] || null;
  localStorage.setItem('rideguard_user', JSON.stringify(user));
}

function selectedChild(user = currentUser()){
  const children = user?.children || [];
  const selectedId = Number(localStorage.getItem('rideguard_selected_child_id') || user?.child?.id || children[0]?.id || 0);
  return children.find(child=>Number(child.id) === selectedId) || children[0] || null;
}

function selectChild(childId){
  const user = currentUser();
  if(!user) return;
  localStorage.setItem('rideguard_selected_child_id', String(childId));
  user.child = selectedChild(user);
  localStorage.setItem('rideguard_user', JSON.stringify(user));
  refreshParentView().catch(err=>toast(err.message,true));
}

function childName(child = selectedChild()){
  return child ? `${child.first_name} ${child.last_name}`.trim() : 'No child selected';
}

function selectedDriver(){
  try { return JSON.parse(localStorage.getItem('rideguard_selected_driver')) || null; }
  catch { return null; }
}

function activeDriverId(){
  const user = currentUser();
  if (user?.role === 'driver') return Number(user.id);
  const stored = Number(localStorage.getItem('rideguard_driver_id') || 0);
  return stored || Number(selectedDriver()?.id || 0);
}

function activeGuardId(){
  const user = currentUser();
  if (user?.role === 'guard') return Number(user.id);
  return Number(localStorage.getItem('rideguard_guard_id') || 0);
}

function storeGuardId(guardId){
  if (!guardId) return;
  localStorage.setItem('rideguard_guard_id', String(guardId));
}

function storeSelectedDriver(driver){
  localStorage.setItem('rideguard_selected_driver', JSON.stringify(driver));
}

function escapeAttr(value = ''){
  return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function driverDisplayName(driver){
  return `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || driver.name || 'Driver';
}

function formatTime(time){
  if(!time) return '';
  const [h,m] = time.split(':');
  const date = new Date();
  date.setHours(Number(h), Number(m || 0), 0, 0);
  return date.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
}

function tripLabel(type){
  return type === 'school_to_home' ? 'School to Home' : 'Home to School';
}

function statusBadge(status){
  const labels = {pending:'Pending', accepted:'Accepted', qr_verified:'QR Verified', in_progress:'In Progress', completed:'Completed', cancelled:'Cancelled'};
  const cls = status === 'pending' ? 'badge-yellow' : status === 'completed' ? 'badge-green' : 'badge-blue';
  return `<span class="badge ${cls}">${labels[status] || status}</span>`;
}

function replaceTextInScreen(screenId, from, to){
  const screen = document.getElementById(screenId);
  if(!screen || !to) return;
  const walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node=>{
    if(node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replaceAll(from, to);
  });
}

function requireParentContext(){
  const user = currentUser();
  if(!user?.id) throw new Error('Login with a registered parent account first');
  const child = selectedChild(user);
  if(!child?.id) throw new Error("Add your child's information before making transactions");
  return {user, child};
}

async function loadChildren(){
  const user = currentUser();
  if(!user?.id) return [];
  const data = await api(`students.php?parent_id=${encodeURIComponent(user.id)}`);
  user.children = data.children;
  user.child = selectedChild(user) || data.children[0] || null;
  storeUser(user);
  return data.children;
}

async function loadParentTrips(){
  const user = currentUser();
  if(!user?.id) return [];
  const data = await api(`trips.php?role=parent&user_id=${encodeURIComponent(user.id)}`);
  return data.trips || [];
}

async function loadNotifications(){
  const user = currentUser();
  if(!user?.id) return [];
  const data = await api(`notifications.php?user_id=${encodeURIComponent(user.id)}`);
  return data.notifications || [];
}

async function sendAlert({userId, title, message, type = 'manual_alert', tripId = null}){
  if(!userId || !title || !message) throw new Error('Missing alert details');
  return api('notifications.php', {
    method:'POST',
    body:JSON.stringify({user_id:userId, title, message, type, trip_id:tripId})
  });
}

async function markAlertRead(notificationId){
  if(!notificationId) return;
  await api('notifications.php', {method:'PATCH', body:JSON.stringify({notification_id:notificationId})});
}

async function loadProfile(userId = currentUser()?.id){
  if(!userId) throw new Error('Login first to view your profile');
  const data = await api(`profile.php?user_id=${encodeURIComponent(userId)}`);
  return data.profile;
}

async function loadDriverTrips(driverId = activeDriverId()){
  const data = await api(`trips.php?role=driver&user_id=${encodeURIComponent(driverId)}`);
  return data.trips || [];
}

async function loadDrivers(){
  const data = await api('drivers.php');
  return data.drivers || [];
}

function rate(n){
  currentRating=n;
  document.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('lit',i<n));
  const submitBtn=document.querySelector('#s-rating .btn-blue');
  if(submitBtn) submitBtn.style.opacity='1';
  const labels=['','Poor','Fair','Good','Great','Excellent!'];
  const lbl=document.getElementById('ratingLabel');
  if(lbl) lbl.textContent=labels[n]||'';
}

function selectRole(btn){
  const label = (btn.textContent || '').toLowerCase();
  selectedSignupRole = label.includes('driver') || label.includes('rider') ? 'driver' : 'parent';
  localStorage.setItem('rideguard_signup_role', selectedSignupRole);
  document.querySelectorAll('.role-toggle').forEach(b=>{
    b.style.background='transparent';
    b.style.color='var(--text2)';
    b.classList.remove('active');
  });
  btn.style.background='var(--blue2)';
  btn.style.color='#fff';
  btn.classList.add('active');
}

function toggleDriver(){
  const t=document.getElementById('driverToggle');
  if(t) t.classList.toggle('off');
  driverStatus().catch(err=>toast(err.message, true));
}

function selectPhase(el){
  document.querySelectorAll('.phase-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
}

async function loginParent(){
  const email = getInput('s-login','parent@example.com');
  const password = getInput('s-login','Enter your Password');
  if(!email || !password) throw new Error('Enter your email and password');
  const data = await api('auth.php', {method:'POST', body:JSON.stringify({action:'login', email, password})});
  storeUser(data.user);
  if(data.user.role === 'driver'){
    localStorage.setItem('rideguard_driver_id', String(data.user.id));
    toast(`Welcome, ${data.user.first_name}`);
    // In demo mode stay on parent view — driver view is a separate page
    go('s-dashboard');
    return;
  }
  if(data.user.child?.id) localStorage.setItem('rideguard_selected_child_id', String(data.user.child.id));
  await refreshParentView();
  toast(`Welcome, ${data.user.first_name}`);
  go('s-dashboard');
}

function validateEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password){
  // Demo mode: accept any password with 6+ chars
  return password.length >= 6;
}

function parentRegistrationPayload(){
  const role = localStorage.getItem('rideguard_signup_role') || selectedSignupRole || 'parent';
  return {
    action:'register',
    role,
    first_name:getInput('s-reg1','First Name'),
    last_name:getInput('s-reg1','Last Name'),
    email:getInput('s-reg1','Email Address'),
    phone:getInput('s-reg1','Your phone number'),
    vehicle_make:getInput('s-reg2','Vehicle Make'),
    vehicle_model:getInput('s-reg2','Vehicle Model'),
    plate_number:getInput('s-reg2','Plate Number'),
    vehicle_color:getInput('s-reg2','Vehicle Color'),
    years_experience:getInput('s-reg2','Years of Experience'),
    child_first_name:getInput('s-reg2',"Child's First Name"),
    child_last_name:getInput('s-reg2',"Child's Last Name"),
    child_date_of_birth:getInput('s-reg2','Date of Birth'),
    child_grade_level:getInput('s-reg2','Grade Level'),
    school_name:getInput('s-reg2','School'),
    child_age:getInput('s-reg2',"Child's Age"),
    password:getInput('s-reg3','Create a sure password')
  };
}

function validateRegisterStep(step){
  const payload = parentRegistrationPayload();
  if(step >= 1){
    if(!payload.first_name || !payload.last_name || !payload.email || !payload.phone) throw new Error('Complete your personal details');
    if(!validateEmail(payload.email)) throw new Error('Enter a valid email address');
  }
  if(step >= 2){
    if(payload.role === 'driver'){
      if(!payload.vehicle_make || !payload.vehicle_model || !payload.plate_number) throw new Error('Complete your vehicle details');
      const years = Number(payload.years_experience || 1);
      if(!Number.isInteger(years) || years < 0 || years > 60) throw new Error('Enter valid years of experience');
    } else {
    if(!payload.child_first_name || !payload.child_last_name || !payload.child_date_of_birth || !payload.child_grade_level || !payload.school_name) throw new Error("Complete your child's information");
    const age = calculateAge(payload.child_date_of_birth);
    if(!Number.isInteger(age) || age < 1 || age > 18) throw new Error("Enter a valid child's date of birth");
    }
  }
  if(step >= 3){
    const confirm = getInput('s-reg3','Re-enter password');
    if(!payload.password || !confirm) throw new Error('Enter and confirm your password');
    if(!validatePassword(payload.password)) throw new Error('Password must be 8+ characters with uppercase, lowercase, and a number');
    if(payload.password !== confirm) throw new Error('Passwords do not match');
  }
  return payload;
}

async function registerParent(){
  const payload = validateRegisterStep(3);
  const data = await api('auth.php', {method:'POST', body:JSON.stringify(payload)});
  storeUser(data.user);
  if(data.user.role === 'driver'){
    localStorage.setItem('rideguard_driver_id', String(data.user.id));
    toast('Driver account created — use the Driver View tab above');
    go('s-success');
    return;
  }
  localStorage.setItem('rideguard_selected_child_id', String(data.student_id));
  toast('Parent account created');
  go('s-success');
}

function renderRegistrationStepTwo(){
  const screen = document.getElementById('s-reg2');
  const role = localStorage.getItem('rideguard_signup_role') || selectedSignupRole || 'parent';
  const content = screen?.querySelector('div[style*="overflow-y:auto"]');
  if(!content) return;
  if(role !== 'driver'){
    if(originalRegisterStepTwo && content.dataset.roleForm === 'driver'){
      content.innerHTML = originalRegisterStepTwo;
      content.dataset.roleForm = 'parent';
    }
    return;
  }
  if(content.dataset.roleForm === 'driver') return;
  if(!originalRegisterStepTwo) originalRegisterStepTwo = content.innerHTML;
  content.dataset.roleForm = 'driver';
  content.innerHTML = `
    <div style="text-align:center;margin-bottom:12px">
      <div style="font-size:58px;margin-bottom:6px">DR</div>
      <h2 style="font-size:20px;font-weight:800;color:var(--blue2)">Enter Driver Information</h2>
      <p style="font-size:13px;color:var(--blue2);margin-top:4px">Step 2 of 3</p>
    </div>
    <div class="step-bar"><div class="step-seg done"></div><div class="step-seg done"></div><div class="step-seg"></div></div>
    <p style="font-size:13px;color:var(--blue2);font-weight:600;margin-bottom:14px">Vehicle Details</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <input class="input-field" placeholder="Vehicle Make">
      <input class="input-field" placeholder="Vehicle Model">
      <input class="input-field" placeholder="Plate Number">
      <input class="input-field" placeholder="Vehicle Color">
      <input class="input-field" type="number" min="0" max="60" placeholder="Years of Experience">
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-outline" onclick="go('s-reg1')" style="border-color:var(--blue2);color:var(--blue2)">PREVIOUS</button>
        <button class="btn btn-blue" onclick="doRegStep2()">NEXT</button>
      </div>
    </div>
  `;
}

async function completeSignUp(event){
  if(event) event.preventDefault();
  try {
    await registerParent();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderChildren(children){
  if(!children.length) return '<div class="rg-muted-state">Add your first child to start scheduling trips.</div>';
  const active = selectedChild();
  return `<div class="rg-child-list">${children.map(child=>`
    <div class="rg-child-row ${active?.id == child.id ? 'active' : ''}">
      <div>
        <div style="font-size:15px;font-weight:800">${childName(child)}</div>
        <div style="font-size:12px;color:var(--text2)">${child.grade_level || 'Grade not set'} - Age ${child.age || ''}</div>
        <div style="font-size:12px;color:var(--text2)">${child.school_name || 'Lincoln Elementary School'}</div>
        ${child.qr_code ? `
          <div class="rg-qr-wrap">
            <div class="rg-child-qr" data-qr-code="${escapeAttr(child.qr_code)}"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;color:var(--text3);margin-bottom:5px">Student QR</div>
              <div style="font-size:11px;font-weight:800;color:var(--text);word-break:break-all">${child.qr_code}</div>
              <button class="rg-copy" onclick="navigator.clipboard?.writeText('${escapeAttr(child.qr_code)}').then(()=>toast('Copied QR code'))">Copy QR</button>
            </div>
          </div>` : ''}
      </div>
      <button class="rg-small-btn" onclick="selectChild(${Number(child.id)})">${active?.id == child.id ? 'Selected' : 'Select'}</button>
    </div>`).join('')}</div>`;
}

function renderParentDashboard(children, trips, notifications = []){
  const screen = document.querySelector('#s-dashboard .scroll-content');
  if(!screen) return;
  const user = currentUser();
  const activeTrips = trips.filter(t=>['pending','accepted','qr_verified','in_progress'].includes(t.status));
  const monitorable = activeTrips.find(t=>['accepted','qr_verified','in_progress'].includes(t.status));
  const latest = activeTrips[0];
  screen.innerHTML = `
    <div style="background:linear-gradient(135deg,#29b6d9,#1565C0);border-radius:14px;padding:16px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <div><div style="color:#fff;font-size:17px;font-weight:700">Welcome back,</div><div style="color:#fff;font-size:17px;font-weight:800">Parent ${user?.first_name || ''}!</div></div>
      <div style="width:38px;height:38px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center"></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:15px;font-weight:700">Trip Status</span>
      ${latest ? statusBadge(latest.status) : ''}
    </div>
    <div class="card card-shadow" style="margin-bottom:14px">
      ${latest ? `
        <div style="font-size:15px;font-weight:800">${latest.student_first_name} ${latest.student_last_name}</div>
        <div style="font-size:13px;color:var(--text2);margin-top:2px">${tripLabel(latest.trip_type)} at ${formatTime(latest.pickup_time)}</div>
        <div style="font-size:13px;color:var(--text2)">Driver: ${latest.driver_first_name || ''} ${latest.driver_last_name || ''}</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:12px">${latest.status === 'pending' ? "Waiting for the driver's accept" : 'Monitoring is available'}</div>
        <button class="btn ${monitorable ? 'btn-green' : 'btn-outline'}" onclick="openTripMonitorFromButton()">${monitorable ? 'Monitor Trip' : 'Waiting for Driver'}</button>
      ` : '<div class="rg-muted-state">No scheduled trips yet.</div>'}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:15px;font-weight:700">My Children</span>
      <button class="rg-small-btn" onclick="showAddChildForm()">${children.length >= 2 ? 'Max 2 Children' : '+ Add Child'}</button>
    </div>
    <div id="addChildPanel" class="card card-shadow" style="display:none;margin-bottom:12px">
      <div class="rg-form-grid">
        <input class="input-field" id="newChildFirst" placeholder="Child's First Name">
        <input class="input-field" id="newChildLast" placeholder="Child's Last Name">
        <input class="input-field" id="newChildDob" type="date" placeholder="Date of Birth">
        <input class="input-field" id="newChildGrade" placeholder="Grade Level">
        <input class="input-field" id="newChildSchool" placeholder="School Name">
        <button class="btn btn-blue" onclick="addChild()">Save Child</button>
      </div>
    </div>
    ${renderChildren(children)}
    <button class="btn btn-blue" style="margin-bottom:14px" onclick="go('s-schedule')">Schedule Trip</button>
    <div style="font-size:15px;font-weight:700;margin-bottom:10px">Notifications</div>
    ${notifications.length ? notifications.slice(0,3).map(n=>`
      <div class="card card-shadow" style="margin-bottom:10px;border-color:${Number(n.is_read) ? 'var(--border)' : '#bfdbfe'}">
        <div style="font-size:13px;font-weight:800">${n.title}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px">${n.message}</div>
      </div>`).join('') : '<div class="rg-muted-state" style="margin-bottom:14px">No notifications yet.</div>'}
    <div style="font-size:15px;font-weight:700;margin-bottom:10px">Recent Trips</div>
    ${trips.length ? trips.slice(0,3).map(t=>`
      <div class="card card-shadow" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px"><div><div style="font-size:14px;font-weight:800">${t.student_first_name} ${t.student_last_name}</div><div style="font-size:12px;color:var(--text2)">${tripLabel(t.trip_type)} - ${formatTime(t.pickup_time)}</div></div>${statusBadge(t.status)}</div>
      </div>`).join('') : '<div class="rg-muted-state">Trips you schedule will show here.</div>'}
  `;
  renderQrCodes();
}

function ensureUtilityScreens(){
  const phone = document.getElementById('phone');
  if(!phone) return;
  if(!document.getElementById('s-alerts')){
    phone.insertAdjacentHTML('beforeend', `
      <div class="screen" id="s-alerts">
        <div class="status-bar white"><span class="status-time">9:41</span><div class="status-icons"></div></div>
        <div class="app-header"><svg width="28" height="28" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#dbeafe"/><path d="M37 52 L50 24 L63 52" fill="#2196F3"/></svg><span class="app-name">RIDEGUARD</span></div>
        <div class="back-btn" onclick="go(defaultHomeScreen())">&#8249; Back</div>
        <div class="divider"></div>
        <div class="scroll-content" style="padding:16px 18px"></div>
      </div>`);
  }
  if(!document.getElementById('s-profile')){
    phone.insertAdjacentHTML('beforeend', `
      <div class="screen" id="s-profile">
        <div class="status-bar white"><span class="status-time">9:41</span><div class="status-icons"></div></div>
        <div class="app-header"><svg width="28" height="28" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#dbeafe"/><path d="M37 52 L50 24 L63 52" fill="#2196F3"/></svg><span class="app-name">RIDEGUARD</span></div>
        <div class="back-btn" onclick="go(defaultHomeScreen())">&#8249; Back</div>
        <div class="divider"></div>
        <div class="scroll-content" style="padding:16px 18px"></div>
      </div>`);
  }
  if(document.getElementById('s-dashboard') && !document.getElementById('s-parent-trip-history')){
    phone.insertAdjacentHTML('beforeend', `
      <div class="screen" id="s-parent-trip-history">
        <div class="status-bar white"><span class="status-time">9:41</span><div class="status-icons"></div></div>
        <div class="app-header"><svg width="28" height="28" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#dbeafe"/><path d="M37 52 L50 24 L63 52" fill="#2196F3"/></svg><span class="app-name">RIDEGUARD</span></div>
        <div class="back-btn" onclick="go('s-dashboard')">&#8249; Back</div>
        <div class="divider"></div>
        <div class="scroll-content" style="padding:16px 18px"></div>
      </div>`);
  }
  if(document.getElementById('s-guard-dash') && !document.getElementById('s-guard-history')){
    phone.insertAdjacentHTML('beforeend', `
      <div class="screen" id="s-guard-history">
        <div class="status-bar white"><span class="status-time">9:41</span><div class="status-icons"></div></div>
        <div class="app-header"><svg width="28" height="28" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#dbeafe"/><path d="M37 52 L50 24 L63 52" fill="#2196F3"/></svg><span class="app-name">RIDEGUARD</span></div>
        <div class="back-btn" onclick="go('s-guard-dash')">&#8249; Back</div>
        <div class="divider"></div>
        <div class="scroll-content" style="padding:16px 18px"></div>
        <div class="nav-bar">
          <div class="nav-item" onclick="go('s-guard-dash')"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#999" stroke-width="2"/><polyline points="9 22 9 12 15 12 15 22" stroke="#999" stroke-width="2"/></svg><span class="nav-label">Scan</span></div>
          <div class="nav-item" onclick="go('s-guard-history')"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 13h7v8H3z" stroke="var(--blue2)" stroke-width="1.6"/><path d="M14 3h7v18h-7z" stroke="var(--blue2)" stroke-width="1.6"/></svg><span class="nav-label active">Trip History</span></div>
          <div class="nav-item" onclick="openProfile()"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#999" stroke-width="2"/><circle cx="12" cy="7" r="4" stroke="#999" stroke-width="2"/></svg><span class="nav-label">Profile</span></div>
        </div>
        <div class="home-bar"><div class="home-indicator"></div></div>
      </div>`);
  }
  replaceBrandLogos();
}

function renderQrCodes(){
  document.querySelectorAll('.rg-child-qr[data-qr-code]').forEach(el=>{
    if(el.dataset.rendered === el.dataset.qrCode) return;
    el.innerHTML = '';
    const code = el.dataset.qrCode || '';
    if(window.QRCode){
      new QRCode(el, {text: code, width: 82, height: 82, correctLevel: QRCode.CorrectLevel.M});
    } else {
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=82x82&data=${encodeURIComponent(code)}`;
      img.alt = 'Student QR code';
      img.width = 82;
      img.height = 82;
      el.appendChild(img);
    }
    el.dataset.rendered = code;
  });
}

function currentScanPhase(){
  const selected = document.querySelector('#phaseRow .phase-card.selected .phase-label')?.textContent.toLowerCase() || '';
  return selected.includes('home to school') ? 'home_to_school' : 'school_to_home';
}

function scanSourceLabel(source){
  if(source === 'driver_dropoff') return 'dropoff';
  return source || 'guard';
}

function ensureQrScannerControls(){
  const screens = [
    ['s-guard-dash', 'guard'],
    ['s-qr-scan', 'driver'],
    ['s-qr-scan-dropoff', 'driver_dropoff'],
  ];
  screens.forEach(([screenId, source])=>{
    const screen = document.getElementById(screenId);
    const qrView = screen?.querySelector('.qr-view');
    if(!screen || !qrView || screen.querySelector('.rg-qr-controls')) return;
    qrView.insertAdjacentHTML('afterend', `
      <div class="rg-qr-controls">
        <video class="rg-qr-video" playsinline muted></video>
        <canvas class="rg-qr-canvas" style="display:none"></canvas>
        <div class="rg-qr-status">Ready to scan QR.</div>
        <input class="input-field rg-qr-manual" placeholder="Detected QR code" style="margin-bottom:8px">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="rg-small-btn" onclick="startQrCamera('${source}')">Camera</button>
          <button class="rg-small-btn" onclick="document.getElementById('qrUpload-${screenId}').click()">Upload QR</button>
          <button class="rg-small-btn" onclick="verifyTypedQr('${source}', '${screenId}')">Verify</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="rg-small-btn" onclick="loadLatestStudentQr('${source}', '${screenId}')">Use Latest Child QR</button>
        </div>
        <div class="rg-scanner-test-qr"></div>
        <input id="qrUpload-${screenId}" type="file" accept="image/*" style="display:none" onchange="scanUploadedQr(this,'${source}')">
      </div>
    `);
  });
}

function qrScreenId(source){
  return source === 'guard' ? 's-guard-dash' : (source === 'driver_dropoff' ? 's-qr-scan-dropoff' : 's-qr-scan');
}

function setQrStatus(source, message, isError = false){
  const status = document.querySelector(`#${qrScreenId(source)} .rg-qr-status`);
  if(status){
    status.textContent = message;
    status.style.color = isError ? '#dc2626' : 'var(--text2)';
  }
}

function setDetectedQr(source, value){
  const input = document.querySelector(`#${qrScreenId(source)} .rg-qr-manual`);
  if(input) input.value = value || '';
}

async function loadLatestStudentQr(source, screenId){
  try {
    const data = await api('students.php?latest=1');
    const qrCode = data.child?.qr_code || '';
    if(!qrCode) throw new Error('No child QR found yet.');
    const input = document.querySelector(`#${screenId} .rg-qr-manual`);
    if(input) input.value = qrCode;
    const qrBox = document.querySelector(`#${screenId} .rg-scanner-test-qr`);
    if(qrBox){
      qrBox.innerHTML = '<div style="font-size:12px;font-weight:800;color:var(--text2);margin-bottom:6px">Latest child QR</div><div class="rg-child-qr" data-qr-code=""></div>';
      const qr = qrBox.querySelector('.rg-child-qr');
      qr.dataset.qrCode = qrCode;
      renderQrCodes();
    }
    setQrStatus(source, 'Latest child QR loaded. Press Verify or scan this QR with another device.');
  } catch(err){
    setQrStatus(source, err.message || 'Could not load latest child QR.', true);
    toast(err.message || 'Could not load latest child QR.', true);
  }
}

function stopQrCamera(){
  if(qrScanTimer) cancelAnimationFrame(qrScanTimer);
  qrScanTimer = null;
  if(qrCameraStream){
    qrCameraStream.getTracks().forEach(track=>track.stop());
    qrCameraStream = null;
  }
  document.querySelectorAll('.rg-qr-video').forEach(video=>{
    video.pause();
    video.removeAttribute('srcObject');
    video.style.display = 'none';
  });
}

async function decodeQrFromBitmap(bitmap){
  if('BarcodeDetector' in window){
    const detector = new BarcodeDetector({formats:['qr_code']});
    const codes = await detector.detect(bitmap);
    const value = codes[0]?.rawValue || codes[0]?.rawData || '';
    if(value) return value;
  }
  if(window.jsQR){
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return decodeQrFromCanvas(canvas);
  }
  throw new Error('QR scanner library did not load. Check your connection, then refresh the page.');
}

function decodeQrFromCanvas(canvas){
  if(!window.jsQR) return '';
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = window.jsQR(imageData.data, imageData.width, imageData.height, {inversionAttempts:'attemptBoth'});
  return code?.data || '';
}

async function scanUploadedQr(input, source){
  const file = input.files?.[0];
  input.value = '';
  if(!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    lastScannedQrCode = await decodeQrFromBitmap(bitmap);
    setDetectedQr(source, lastScannedQrCode);
    setQrStatus(source, 'QR detected. Verifying...');
    toast('QR detected from uploaded image');
    await completeQrScan(source);
  } catch(err){
    setQrStatus(source, 'Could not read that QR image.', true);
    const manual = (window.prompt(`${err.message}\nEnter QR code manually`) || '').trim();
    if(!manual) return;
    lastScannedQrCode = manual;
    setDetectedQr(source, manual);
    await completeQrScan(source);
  }
}

async function verifyTypedQr(source, screenId){
  const input = document.querySelector(`#${screenId} .rg-qr-manual`);
  const value = (input?.value || '').trim();
  if(!value) return toast('Scan, upload, or enter a QR code first.', true);
  lastScannedQrCode = value;
  setQrStatus(source, 'Verifying QR...');
  await completeQrScan(source);
}

async function startQrCamera(source){
  const screenId = qrScreenId(source);
  const screen = document.getElementById(screenId);
  const video = screen?.querySelector('.rg-qr-video');
  const canvas = screen?.querySelector('.rg-qr-canvas');
  if(!video) return;
  try {
    stopQrCamera();
    qrCameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject = qrCameraStream;
    video.style.display = 'block';
    setQrStatus(source, 'Camera active. Point it at the student QR.');
    await video.play();
    const detector = 'BarcodeDetector' in window ? new BarcodeDetector({formats:['qr_code']}) : null;
    if(!detector && !window.jsQR) throw new Error('QR scanner library did not load. Check your connection, then refresh the page.');
    const tick = async () => {
      try {
        let value = '';
        if(detector){
          try {
            const codes = await detector.detect(video);
            value = codes[0]?.rawValue || codes[0]?.rawData || '';
          } catch(e) {}
        }
        if(!value && canvas && video.videoWidth && video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d', {willReadFrequently:true});
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          value = decodeQrFromCanvas(canvas);
        }
        if(value){
          lastScannedQrCode = value;
          setDetectedQr(source, value);
          setQrStatus(source, 'QR detected. Verifying...');
          stopQrCamera();
          toast('QR detected');
          await completeQrScan(source);
          return;
        }
      } catch(e) {}
      qrScanTimer = requestAnimationFrame(tick);
    };
    tick();
  } catch(err){
    stopQrCamera();
    setQrStatus(source, err.message || 'Camera unavailable', true);
    toast(err.message || 'Camera unavailable', true);
  }
}

async function completeQrScan(source){
  if(source === 'driver') return window.doDriverQrScan();
  if(source === 'driver_dropoff') return window.doDropoffScan();
  return window.doGuardScan();
}

function defaultHomeScreen(){
  if(document.getElementById('s-driver-dash')) return 's-driver-dash';
  if(document.getElementById('s-guard-dash')) return 's-guard-dash';
  return 's-dashboard';
}

async function promptLogin(role){
  const demoEmails = {
    driver: 'driver@example.com',
    guard: 'guard@example.com',
    parent: 'parent@example.com'
  };
  const demoEmail = demoEmails[role] || '';
  const emailHint = demoEmail ? `\nDemo ${role} email: ${demoEmail}` : '';
  const email = (window.prompt(`Enter ${role} email${emailHint}`) || '').trim();
  if (!email) throw new Error('Email is required');
  const password = (window.prompt('Enter your password\nDemo password: Password123') || '').trim();
  if (!password) throw new Error('Password is required');
  const data = await api('auth.php', {method:'POST', body:JSON.stringify({action:'login', email, password})});
  storeUser(data.user);
  if (data.user.role === 'driver') {
    localStorage.setItem('rideguard_driver_id', String(data.user.id));
  }
  if (data.user.role === 'guard') {
    storeGuardId(data.user.id);
  }
  return data.user;
}

async function ensureDriverSession(){
  const user = currentUser();
  if (user?.role === 'driver') return user;
  const driverId = activeDriverId();
  if (driverId) return {id: driverId, role:'driver'};
  return await promptLogin('driver');
}

async function ensureGuardSession(){
  const user = currentUser();
  if (user?.role === 'guard') return user;
  const guardId = activeGuardId();
  if (guardId) return {id: guardId, role:'guard'};
  return await promptLogin('guard');
}

function roleUser(defaultId){
  const stored = currentUser();
  if (document.getElementById('s-driver-dash')) {
    if (stored?.role === 'driver') return stored;
    const driverId = activeDriverId();
    return driverId ? {id: driverId, role: 'driver'} : null;
  }
  if (document.getElementById('s-guard-dash')) {
    if (stored?.role === 'guard') return stored;
    const guardId = activeGuardId();
    return guardId ? {id: guardId, role: 'guard'} : null;
  }
  if (stored?.id) return stored;
  return null;
}

async function resolvedRoleUser(){
  if (document.getElementById('s-driver-dash')) return await ensureDriverSession();
  if (document.getElementById('s-guard-dash')) return await ensureGuardSession();
  return currentUser();
}

function renderAlerts(notifications){
  const screen = document.querySelector('#s-alerts .scroll-content');
  if(!screen) return;
  screen.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:14px">Alerts</h2>
    ${notifications.length ? notifications.map(n=>`
      <div class="card card-shadow" style="margin-bottom:10px;border-color:${Number(n.is_read) ? 'var(--border)' : '#bfdbfe'}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <div style="font-size:14px;font-weight:800">${n.title}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:4px">${n.message}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:8px">${new Date(n.created_at).toLocaleString()}</div>
          </div>
          ${Number(n.is_read) ? '' : `<button class="rg-small-btn" onclick="markAlertReadAndRefresh(${Number(n.id)})">Read</button>`}
        </div>
      </div>`).join('') : '<div class="rg-muted-state">No alerts yet.</div>'}
  `;
}

async function openAlerts(navigate = true){
  ensureUtilityScreens();
  const user = await resolvedRoleUser();
  if(!user?.id) return toast('Login first to view alerts', true);
  if(navigate){
    renderAlerts([]);
    const screen = document.querySelector('#s-alerts .scroll-content');
    if(screen) screen.innerHTML = '<h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:14px">Alerts</h2><div class="rg-muted-state">Loading alerts...</div>';
    window._rgOpeningUtility = true;
    go('s-alerts');
    window._rgOpeningUtility = false;
  }
  const data = await api(`notifications.php?user_id=${encodeURIComponent(user.id)}`);
  renderAlerts(data.notifications || []);
}

async function openParentTripHistory(navigate = true){
  ensureUtilityScreens();
  if(!document.getElementById('s-parent-trip-history')) return;
  const user = currentUser();
  if(!user?.id) return toast('Login first to view trip history', true);
  if(navigate){
    const screen = document.querySelector('#s-parent-trip-history .scroll-content');
    if(screen) screen.innerHTML = '<h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:14px">Trip History</h2><div class="rg-muted-state">Loading trips...</div>';
    window._rgOpeningUtility = true;
    go('s-parent-trip-history');
    window._rgOpeningUtility = false;
  }
  const trips = await loadParentTrips();
  renderParentTripHistory(trips);
}

async function markAlertReadAndRefresh(notificationId){
  await markAlertRead(notificationId);
  await openAlerts();
}

function renderProfile(profile, editMode = ''){
  const screen = document.querySelector('#s-profile .scroll-content');
  if(!screen) return;
  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  const driver = profile.driver_profile;
  const parent = profile.parent_profile || {};
  screen.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px">
      <h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin:0">Profile</h2>
      ${profile.role === 'parent' && !editMode ? '<button class="rg-small-btn" onclick="openParentProfileEditor()">Update</button>' : ''}
      ${driver && !editMode ? '<button class="rg-small-btn" onclick="openDriverProfileEditor()">Update</button>' : ''}
    </div>
    <div class="card card-shadow" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="driver-avatar">${(profile.first_name || 'U').slice(0,1)}</div>
        <div>
          <div style="font-size:16px;font-weight:800">${fullName || 'RideGuard User'}</div>
          <div style="font-size:12px;color:var(--text2);text-transform:capitalize">${profile.role || ''}</div>
        </div>
      </div>
    </div>
    ${profile.role === 'parent' && !editMode ? `
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:10px">Contact</div>
        <div style="font-size:13px;color:var(--text2)">Email</div><div style="font-size:14px;font-weight:700;margin-bottom:8px">${profile.email || '-'}</div>
        <div style="font-size:13px;color:var(--text2)">Phone</div><div style="font-size:14px;font-weight:700">${profile.phone || '-'}</div>
      </div>
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:10px">Emergency Info</div>
        <div style="font-size:13px;color:var(--text2)">Emergency Contact</div><div style="font-size:14px;font-weight:700;margin-bottom:8px">${parent.emergency_contact || '-'}</div>
        <div style="font-size:13px;color:var(--text2)">Address</div><div style="font-size:14px;font-weight:700">${parent.address || '-'}</div>
      </div>
    ` : ''}
    ${profile.role === 'parent' && editMode === 'parent' ? `
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:12px">Update Information</div>
        <label class="input-label">First Name</label>
        <input id="profileFirstName" class="input-field" style="margin-bottom:10px" value="${profile.first_name || ''}">
        <label class="input-label">Last Name</label>
        <input id="profileLastName" class="input-field" style="margin-bottom:10px" value="${profile.last_name || ''}">
        <label class="input-label">Email</label>
        <input class="input-field" style="margin-bottom:10px;background:#f8fafc" value="${profile.email || ''}" disabled>
        <label class="input-label">Phone</label>
        <input id="profilePhone" class="input-field" style="margin-bottom:10px" value="${profile.phone || ''}">
        <label class="input-label">Emergency Contact</label>
        <input id="profileEmergency" class="input-field" style="margin-bottom:10px" value="${parent.emergency_contact || ''}">
        <label class="input-label">Address</label>
        <textarea id="profileAddress" class="input-field" style="height:82px;resize:none;margin-bottom:12px">${parent.address || ''}</textarea>
        <div style="display:flex;gap:10px">
          <button class="btn btn-outline" style="padding:13px" onclick="openProfile()">Cancel</button>
          <button class="btn btn-blue" style="padding:13px" onclick="saveParentProfile()">Save</button>
        </div>
      </div>
    ` : ''}
    ${driver && !editMode ? `
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:10px">Contact</div>
        <div style="font-size:13px;color:var(--text2)">Email</div><div style="font-size:14px;font-weight:700;margin-bottom:8px">${profile.email || '-'}</div>
        <div style="font-size:13px;color:var(--text2)">Phone</div><div style="font-size:14px;font-weight:700">${profile.phone || '-'}</div>
      </div>
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:10px">Vehicle</div>
        <div style="font-size:13px;color:var(--text2)">Car</div><div style="font-size:14px;font-weight:700;margin-bottom:8px">${driver.color || ''} ${driver.make || ''} ${driver.model || ''}</div>
        <div style="font-size:13px;color:var(--text2)">Plate Number</div><div style="font-size:14px;font-weight:700">${driver.plate_number || '-'}</div>
      </div>
      <div class="card card-shadow">
        <div style="font-size:14px;font-weight:800;margin-bottom:10px">Driver Stats</div>
        <div style="font-size:13px;color:var(--text2)">Rating</div><div style="font-size:14px;font-weight:700;margin-bottom:8px">${driver.rating || '-'} rating</div>
        <div style="font-size:13px;color:var(--text2)">Trips</div><div style="font-size:14px;font-weight:700">${driver.total_trips || 0} total trips</div>
      </div>
    ` : ''}
    ${driver && editMode === 'menu' ? `
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:12px">What do you want to update?</div>
        <button class="btn btn-blue" style="margin-bottom:10px" onclick="openDriverProfileEditor('contact')">Contact Information</button>
        <button class="btn btn-outline" style="border-color:var(--blue2);color:var(--blue2)" onclick="openDriverProfileEditor('vehicle')">Vehicle Information</button>
      </div>
    ` : ''}
    ${driver && editMode === 'contact' ? `
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:12px">Update Contact</div>
        <label class="input-label">First Name</label>
        <input id="profileFirstName" class="input-field" style="margin-bottom:10px" value="${profile.first_name || ''}">
        <label class="input-label">Last Name</label>
        <input id="profileLastName" class="input-field" style="margin-bottom:10px" value="${profile.last_name || ''}">
        <label class="input-label">Email</label>
        <input class="input-field" style="margin-bottom:10px;background:#f8fafc" value="${profile.email || ''}" disabled>
        <label class="input-label">Phone</label>
        <input id="profilePhone" class="input-field" style="margin-bottom:12px" value="${profile.phone || ''}">
        <div style="display:flex;gap:10px">
          <button class="btn btn-outline" style="padding:13px" onclick="openProfile()">Cancel</button>
          <button class="btn btn-blue" style="padding:13px" onclick="saveDriverProfile()">Save</button>
        </div>
      </div>
    ` : ''}
    ${driver && editMode === 'vehicle' ? `
      <div class="card card-shadow" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:12px">Update Vehicle</div>
        <label class="input-label">Vehicle Make</label>
        <input id="profileVehicleMake" class="input-field" style="margin-bottom:10px" value="${driver.make || ''}">
        <label class="input-label">Vehicle Model</label>
        <input id="profileVehicleModel" class="input-field" style="margin-bottom:10px" value="${driver.model || ''}">
        <label class="input-label">Plate Number</label>
        <input id="profilePlateNumber" class="input-field" style="margin-bottom:10px" value="${driver.plate_number || ''}">
        <label class="input-label">Vehicle Color</label>
        <input id="profileVehicleColor" class="input-field" style="margin-bottom:10px" value="${driver.color || ''}">
        <label class="input-label">Years of Experience</label>
        <input id="profileYearsExperience" class="input-field" type="number" min="0" max="60" style="margin-bottom:12px" value="${driver.years_experience || 1}">
        <div style="display:flex;gap:10px">
          <button class="btn btn-outline" style="padding:13px" onclick="openProfile()">Cancel</button>
          <button class="btn btn-blue" style="padding:13px" onclick="saveDriverVehicleProfile()">Save</button>
        </div>
      </div>
    ` : ''}
  `;
}

async function saveParentProfile(){
  const user = roleUser();
  if(!user?.id) return toast('Login first to update profile', true);
  const payload = {
    user_id:user.id,
    first_name:document.getElementById('profileFirstName')?.value.trim(),
    last_name:document.getElementById('profileLastName')?.value.trim(),
    phone:document.getElementById('profilePhone')?.value.trim(),
    emergency_contact:document.getElementById('profileEmergency')?.value.trim(),
    address:document.getElementById('profileAddress')?.value.trim()
  };
  if(!payload.first_name || !payload.last_name) return toast('First and last name are required', true);
  await api('profile.php', {method:'PATCH', body:JSON.stringify(payload)});
  const stored = currentUser();
  if(stored?.id === user.id){
    stored.first_name = payload.first_name;
    stored.last_name = payload.last_name;
    stored.phone = payload.phone;
    storeUser(stored);
  }
  toast('Profile updated');
  renderProfile(await loadProfile(user.id));
}

async function openParentProfileEditor(){
  const user = roleUser();
  if(!user?.id) return toast('Login first to update profile', true);
  renderProfile(await loadProfile(user.id), 'parent');
}

async function saveDriverProfile(){
  const user = roleUser();
  if(!user?.id) return toast('Login first to update profile', true);
  const payload = {
    user_id:user.id,
    first_name:document.getElementById('profileFirstName')?.value.trim(),
    last_name:document.getElementById('profileLastName')?.value.trim(),
    phone:document.getElementById('profilePhone')?.value.trim()
  };
  if(!payload.first_name || !payload.last_name) return toast('First and last name are required', true);
  await api('profile.php', {method:'PATCH', body:JSON.stringify(payload)});
  const stored = currentUser();
  if(stored?.id === user.id){
    stored.first_name = payload.first_name;
    stored.last_name = payload.last_name;
    stored.phone = payload.phone;
    storeUser(stored);
  }
  toast('Profile updated');
  renderProfile(await loadProfile(user.id));
  if(document.getElementById('s-driver-dash')) refreshDriverView();
}

async function saveDriverVehicleProfile(){
  const user = roleUser();
  if(!user?.id) return toast('Login first to update profile', true);
  const profile = await loadProfile(user.id);
  const payload = {
    user_id:user.id,
    first_name:profile.first_name || '',
    last_name:profile.last_name || '',
    phone:profile.phone || '',
    vehicle_make:document.getElementById('profileVehicleMake')?.value.trim(),
    vehicle_model:document.getElementById('profileVehicleModel')?.value.trim(),
    plate_number:document.getElementById('profilePlateNumber')?.value.trim(),
    vehicle_color:document.getElementById('profileVehicleColor')?.value.trim(),
    years_experience:document.getElementById('profileYearsExperience')?.value.trim()
  };
  if(!payload.vehicle_make || !payload.vehicle_model || !payload.plate_number) return toast('Complete your vehicle details', true);
  await api('profile.php', {method:'PATCH', body:JSON.stringify(payload)});
  toast('Vehicle updated');
  renderProfile(await loadProfile(user.id));
  if(document.getElementById('s-driver-dash')) refreshDriverView();
}

async function openDriverProfileEditor(mode = 'menu'){
  const user = roleUser();
  if(!user?.id) return toast('Login first to update profile', true);
  renderProfile(await loadProfile(user.id), mode);
}

async function openProfile(navigate = true){
  ensureUtilityScreens();
  const user = await resolvedRoleUser();
  if(!user?.id) return toast('Login first to view profile', true);
  if(navigate){
    const screen = document.querySelector('#s-profile .scroll-content');
    if(screen) screen.innerHTML = '<h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:14px">Profile</h2><div class="rg-muted-state">Loading profile...</div>';
    window._rgOpeningUtility = true;
    go('s-profile');
    window._rgOpeningUtility = false;
  }
  renderProfile(await loadProfile(user.id));
}

function removeTrackNavItems(){
  document.querySelectorAll('.nav-item').forEach(item=>{
    const label = item.querySelector('.nav-label')?.textContent.trim().toLowerCase();
    if(label === 'track'){
      if(document.getElementById('s-dashboard') && !document.getElementById('s-driver-dash') && !document.getElementById('s-guard-dash')){
        item.setAttribute('onclick', 'openParentTripHistory()');
        const svg = item.querySelector('svg');
        if(svg) svg.outerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 5h16M4 12h16M4 19h10" stroke="#999" stroke-width="2" stroke-linecap="round"/><path d="M17 16v3l2 1" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const navLabel = item.querySelector('.nav-label');
        if(navLabel) navLabel.textContent = 'Trip History';
      } else {
        item.remove();
      }
    }
  });
}

function bindUtilityNav(){
  if(window._rideguardUtilityNavBound) return;
  window._rideguardUtilityNavBound = true;
  const hasParentNav = document.getElementById('s-dashboard') && !document.getElementById('s-driver-dash') && !document.getElementById('s-guard-dash');
  document.querySelectorAll('.nav-item').forEach(item=>{
    const label = item.textContent.trim().toLowerCase();
    if(label === 'alerts') item.setAttribute('data-rg-nav', 'alerts');
    if(label === 'profile') item.setAttribute('data-rg-nav', 'profile');
    if(hasParentNav && (label === 'history' || label === 'trip history')) item.setAttribute('data-rg-nav', 'history');
  });
  document.addEventListener('click', event=>{
    const item = event.target.closest('.nav-item');
    if(!item) return;
    const label = (item.dataset.rgNav || item.textContent.trim()).toLowerCase();
    if(label === 'alerts'){
      event.preventDefault();
      event.stopPropagation();
      openAlerts().catch(err=>toast(err.message,true));
    }
    if(label === 'profile'){
      event.preventDefault();
      event.stopPropagation();
      openProfile().catch(err=>toast(err.message,true));
    }
    if(hasParentNav && (label === 'history' || label === 'trip history')){
      event.preventDefault();
      event.stopPropagation();
      openParentTripHistory().catch(err=>toast(err.message,true));
    }
  }, true);
}

window.openAlerts = openAlerts;
window.openProfile = openProfile;
window.openParentTripHistory = openParentTripHistory;
window.sendAlert = sendAlert;
window.saveParentProfile = saveParentProfile;
window.saveDriverProfile = saveDriverProfile;
window.openParentProfileEditor = openParentProfileEditor;
window.openDriverProfileEditor = openDriverProfileEditor;
window.saveDriverVehicleProfile = saveDriverVehicleProfile;

function showAddChildForm(){
  const user = currentUser();
  if((user?.children || []).length >= 2) return toast('You can add up to 2 children only', true);
  const panel = document.getElementById('addChildPanel');
  if(panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function addChild(){
  const user = currentUser();
  if(!user?.id) throw new Error('Login first');
  if((user.children || []).length >= 2) throw new Error('You can add up to 2 children only');
  const first = document.getElementById('newChildFirst')?.value.trim();
  const last = document.getElementById('newChildLast')?.value.trim();
  const dateOfBirth = document.getElementById('newChildDob')?.value.trim();
  const gradeLevel = document.getElementById('newChildGrade')?.value.trim();
  const school = document.getElementById('newChildSchool')?.value.trim() || 'Lincoln Elementary School';
  const data = await api('students.php', {method:'POST', body:JSON.stringify({parent_id:user.id, first_name:first, last_name:last, date_of_birth:dateOfBirth, grade_level:gradeLevel, school_name:school})});
  user.children = (user.children || []).concat([data.child]);
  user.child = data.child;
  localStorage.setItem('rideguard_selected_child_id', String(data.child.id));
  storeUser(user);
  await refreshParentView();
  toast('Child added');
}

async function refreshParentView(){
  if(!document.getElementById('s-dashboard')) return;
  const user = currentUser();
  if(!user?.id) return;
  const children = await loadChildren();
  const [trips, notifications, drivers] = await Promise.all([loadParentTrips(), loadNotifications(), loadDrivers()]);
  renderParentDashboard(children, trips, notifications);
  renderScheduleScreen(children);
  renderDriverSelection(drivers);
  renderConfirmSchedule();
}

function renderScheduleScreen(children = currentUser()?.children || []){
  const content = document.querySelector('#s-schedule > div[style*="flex:1"]');
  if(!content) return;
  const active = selectedChild();
  content.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:var(--blue2);margin-bottom:4px">Schedule Trip</h2>
    <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Choose child, pickup time, and trip type.</p>
    <label class="input-label">Child</label>
    <select id="scheduleChild" class="input-field" style="margin-bottom:12px" onchange="selectChild(this.value)">
      ${children.map(child=>`<option value="${child.id}" ${active?.id == child.id ? 'selected' : ''}>${childName(child)}</option>`).join('')}
    </select>
    <label class="input-label">Pickup Time</label>
    <input id="pickupTime" class="input-field" type="time" value="${localStorage.getItem('rideguard_pickup_time') || '07:30'}" style="margin-bottom:16px">
    <p style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:12px">Select Trip Type</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="card trip-type-card ${selectedTripType === 'home_to_school' ? 'selected' : ''}" data-trip-type="home_to_school" style="display:flex;align-items:center;gap:14px;cursor:pointer">
        <div style="width:42px;height:42px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center"></div>
        <div><div style="font-size:15px;font-weight:800">Home to School</div><div style="font-size:12px;color:var(--text2)">Morning pickup</div></div>
      </div>
      <div class="card trip-type-card ${selectedTripType === 'school_to_home' ? 'selected' : ''}" data-trip-type="school_to_home" style="display:flex;align-items:center;gap:14px;cursor:pointer">
        <div style="width:42px;height:42px;background:#f3e8ff;border-radius:50%;display:flex;align-items:center;justify-content:center"></div>
        <div><div style="font-size:15px;font-weight:800">School to Home</div><div style="font-size:12px;color:var(--text2)">Afternoon pickup</div></div>
      </div>
    </div>
  `;
  document.querySelectorAll('.trip-type-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const tripType = card.dataset.tripType;
      setSelectedTripType(tripType);
      localStorage.setItem('rideguard_pickup_time', document.getElementById('pickupTime')?.value || '07:30');
      go('s-select-driver');
    });
  });
}

function renderConfirmSchedule(){
  const screen = document.getElementById('s-confirm-schedule');
  if(!screen) return;
  const child = selectedChild();
  const driver = selectedDriver();
  const time = localStorage.getItem('rideguard_pickup_time') || document.getElementById('pickupTime')?.value || '07:30';
  const rows = screen.querySelector('.card');
  if(rows){
    rows.innerHTML = `
      <div style="font-size:14px;font-weight:700;margin-bottom:14px">Confirm Schedule</div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0"><span style="font-size:14px;color:var(--text2)">Child</span><span style="font-size:14px;font-weight:700">${childName(child)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0"><span style="font-size:14px;color:var(--text2)">Trip Type</span><span style="font-size:14px;font-weight:700">${tripLabel(selectedTripType)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0"><span style="font-size:14px;color:var(--text2)">Driver</span><span style="font-size:14px;font-weight:700">${driver?.name || 'Select a driver'}</span></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0"><span style="font-size:14px;color:var(--text2)">Pickup Time</span><span style="font-size:14px;font-weight:700">${formatTime(time)}</span></div>
    `;
  }
}

function renderDriverSelection(drivers = []){
  const list = document.querySelector('#s-select-driver .scroll-content > div[style*="margin-top"]');
  if(!list) return;
  if(!drivers.length){
    list.innerHTML = '<div class="rg-muted-state">No available drivers yet.</div>';
    return;
  }
  const maxVisibleDrivers = 3;
  const visibleDrivers = drivers.slice(0, maxVisibleDrivers);
  const hiddenCount = Math.max(0, drivers.length - visibleDrivers.length);
  list.innerHTML = visibleDrivers.map(driver=>{
    const name = driverDisplayName(driver);
    const vehicle = `${driver.make || ''} ${driver.model || ''}`.trim() || 'Vehicle not set';
    return `
      <div class="driver-card">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div class="driver-avatar">${name.slice(0,1).toUpperCase()}</div>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between">
              <span style="font-size:15px;font-weight:700">${name}</span>
              <span style="background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px">${driver.safety_score || 98}</span>
            </div>
            <div style="font-size:12px;color:var(--text2)">${vehicle}</div>
            <div style="font-size:12px;color:#f59e0b;margin-top:4px">★ ${driver.rating || '5.0'} <span style="color:var(--text2)">${driver.total_trips || 0} trips · ${driver.years_experience || 1} years</span></div>
          </div>
        </div>
        <button class="btn btn-blue" style="margin-top:10px;padding:11px;font-size:13px" data-driver-id="${Number(driver.id)}" data-driver-name="${name}">Select Driver</button>
      </div>
    `;
  }).join('');
  if(hiddenCount){
    list.innerHTML += `<div class="rg-muted-state" style="margin-top:12px">Showing ${visibleDrivers.length} of ${drivers.length} drivers to keep the page compact.</div>`;
  }
  bindDriverSelection(visibleDrivers);
}

function bindDriverSelection(drivers = []){
  document.querySelectorAll('#s-select-driver .driver-card .btn-blue').forEach((button,index)=>{
    button.onclick = null;
    button.addEventListener('click',(event)=>{
      event.preventDefault();
      localStorage.setItem('rideguard_pickup_time', document.getElementById('pickupTime')?.value || localStorage.getItem('rideguard_pickup_time') || '07:30');
      const driver = drivers[index] || {id:Number(button.dataset.driverId), name:button.dataset.driverName};
      storeSelectedDriver(Object.assign({}, driver, {name:driverDisplayName(driver)}));
      renderConfirmSchedule();
      go('s-confirm-schedule');
    });
  });
}

async function scheduleTrip(){
  const {user, child} = requireParentContext();
  const driver = selectedDriver();
  if(!driver || !driver.id) throw new Error('Select a driver before scheduling the trip');
  const pickupTime = localStorage.getItem('rideguard_pickup_time') || document.getElementById('pickupTime')?.value || '07:30';
  const recurring = document.querySelector('#s-confirm-schedule input[type="checkbox"]')?.checked ? 1 : 0;
  const data = await api('trips.php', {method:'POST', body:JSON.stringify({
    parent_id:user.id,
    student_id:child.id,
    driver_id:driver.id,
    trip_type:selectedTripType,
    pickup_address: selectedTripType === 'home_to_school' ? DEFAULT_PICKUP : (child.school_name || 'Lincoln Elementary School'),
    dropoff_address: selectedTripType === 'home_to_school' ? (child.school_name || 'Lincoln Elementary School') : DEFAULT_PICKUP,
    pickup_time:pickupTime,
    scheduled_date:new Date().toISOString().slice(0,10),
    is_recurring:recurring
  })});
  localStorage.setItem('rideguard_trip_id', String(data.trip_id));
  localStorage.setItem('rideguard_trip_driver_id', String(driver.id));
  await refreshParentView();
  toast("Trip request sent. Waiting for driver's accept.");
  go('s-trip-booked');
}

async function updateTrip(status, tripId = Number(localStorage.getItem('rideguard_trip_id') || localStorage.getItem('rideguard_driver_trip_id') || 0)){
  if(!tripId) throw new Error('No trip selected');
  await api('trips.php', {method:'PATCH', body:JSON.stringify({trip_id:tripId, status})});
  localStorage.setItem('rideguard_trip_id', String(tripId));
}

async function openTripMonitorFromButton(){
  const trips = await loadParentTrips();
  const trip = trips.find(t=>['accepted','qr_verified','in_progress'].includes(t.status));
  if(!trip) return toast("Waiting for the driver's accept before monitoring.", true);
  localStorage.setItem('rideguard_trip_id', String(trip.id));
  go('s-trip-monitor');
}

async function openTripMonitor(){
  const trips = await loadParentTrips();
  const tripId = Number(localStorage.getItem('rideguard_trip_id') || 0);
  const trip = trips.find(t=>Number(t.id) === tripId) || trips.find(t=>['accepted','qr_verified','in_progress'].includes(t.status));
  if(!trip || trip.status === 'pending'){
    go('s-dashboard');
    return toast("Waiting for the driver's accept before monitoring.", true);
  }
  localStorage.setItem('rideguard_trip_id', String(trip.id));
  renderMonitor(trip);
}

function renderMonitor(trip){
  const mapArea = document.querySelector('#s-trip-monitor .map-area');
  if(mapArea){
    mapArea.innerHTML = '<div id="parentLeafletMap" class="leaflet-map"></div>';
    setTimeout(()=>initLeafletMap(), 50);
  }
  const statusCard = document.querySelector('#s-trip-monitor .scroll-content .card');
  if(statusCard){
    statusCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:14px;font-weight:700">Trip Status</span>${statusBadge(trip.status)}</div>
      <div style="display:flex;gap:12px"><div style="flex:1"><div style="font-size:11px;color:var(--text2)">Pickup</div><div style="font-size:16px;font-weight:800">${formatTime(trip.pickup_time)}</div></div><div style="flex:1"><div style="font-size:11px;color:var(--text2)">ETA</div><div style="font-size:16px;font-weight:800">15 min</div></div></div>
    `;
  }
}

function initLeafletMap(){
  const el = document.getElementById('parentLeafletMap');
  if(!el || typeof L === 'undefined') {
    if(el) el.innerHTML = '<div class="rg-muted-state" style="margin:20px">Map unavailable offline. Trip monitoring is active.</div>';
    return;
  }
  if(parentMap) parentMap.remove();
  parentMap = L.map(el, {zoomControl:false, attributionControl:false}).setView([10.3157, 123.8854], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(parentMap);
  const pickup = [10.327, 123.885];
  const school = [10.3157, 123.9054];
  const driver = [10.321, 123.895];
  L.polyline([pickup, driver, school], {color:'#1d8cf8', weight:5}).addTo(parentMap);
  L.marker(pickup).addTo(parentMap).bindPopup('Pickup');
  L.marker(driver).addTo(parentMap).bindPopup('Driver');
  L.marker(school).addTo(parentMap).bindPopup('School');
}

function stopDriverRouteWatch(){
  if(driverWatchId !== null && navigator.geolocation){
    navigator.geolocation.clearWatch(driverWatchId);
    driverWatchId = null;
  }
  if(driverSimId !== null){
    clearInterval(driverSimId);
    driverSimId = null;
  }
}

function getDriverRoutePoints(trip){
  const schoolCoords = trip.school_latitude && trip.school_longitude
    ? [Number(trip.school_latitude), Number(trip.school_longitude)]
    : [10.3157, 123.9054];
  const homeCoords = [10.3270, 123.8850];
  return trip.trip_type === 'school_to_home' ? [schoolCoords, homeCoords] : [homeCoords, schoolCoords];
}

function formatDriverEta(distanceKm){
  const minutes = Math.max(1, Math.round(distanceKm / 0.35));
  return `${minutes} min`;
}

function haversineDistance([lat1, lng1], [lat2, lng2]){
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return 6371 * c;
}

function updateDriverEta(latlng){
  if(!driverRouteDestination) return;
  const distanceKm = haversineDistance(latlng, driverRouteDestination);
  const etaEl = document.getElementById('driverEta');
  if(etaEl) etaEl.textContent = formatDriverEta(distanceKm);
}

function updateDriverMarker(latlng){
  if(!driverMap) return;
  if(!driverMarker){
    driverMarker = L.circleMarker(latlng, {radius:8, color:'#2563eb', fillColor:'#3b82f6', fillOpacity:1}).addTo(driverMap);
  } else {
    driverMarker.setLatLng(latlng);
  }
  if(driverMap.getBounds && !driverMap.getBounds().contains(latlng)){
    driverMap.panTo(latlng);
  }
  updateDriverEta(latlng);
}

function simulateDriverMovement(points){
  if(driverSimId !== null) clearInterval(driverSimId);
  const [start, end] = points;
  const steps = 20;
  let step = 0;
  driverSimId = setInterval(() => {
    if(step > steps){
      clearInterval(driverSimId);
      driverSimId = null;
      return;
    }
    const lat = start[0] + ((end[0] - start[0]) * step / steps);
    const lng = start[1] + ((end[1] - start[1]) * step / steps);
    updateDriverMarker([lat, lng]);
    step += 1;
  }, 1800);
}

function initDriverMap(trip){
  const el = document.getElementById('driverLeafletMap');
  if(!el || typeof L === 'undefined') {
    if(el) el.innerHTML = '<div class="rg-muted-state" style="margin:20px">Map unavailable offline. Driver navigation is paused.</div>';
    return;
  }
  stopDriverRouteWatch();
  if(driverMap) driverMap.remove();
  el.innerHTML = '';
  driverMap = L.map(el, {zoomControl:false, attributionControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(driverMap);
  const routePoints = getDriverRoutePoints(trip);
  const [start, end] = routePoints;
  driverRoutePolyline = L.polyline(routePoints, {color:'#1d8cf8', weight:5, opacity:0.9}).addTo(driverMap);
  L.circleMarker(start, {radius:8, color:'#065f46', fillColor:'#22c55e', fillOpacity:1}).addTo(driverMap).bindTooltip(trip.trip_type === 'school_to_home' ? 'Home pickup' : 'School', {permanent:false});
  L.circleMarker(end, {radius:8, color:'#1d4ed8', fillColor:'#93c5fd', fillOpacity:1}).addTo(driverMap).bindTooltip(trip.trip_type === 'school_to_home' ? 'School dropoff' : 'Home dropoff', {permanent:false});
  driverMarker = L.circleMarker(start, {radius:7, color:'#1d4ed8', fillColor:'#2563eb', fillOpacity:1}).addTo(driverMap).bindPopup('Your vehicle');
  driverRouteDestination = end;
  driverMap.fitBounds(driverRoutePolyline.getBounds().pad(0.2));
  if(navigator.geolocation){
    driverWatchId = navigator.geolocation.watchPosition(position => {
      updateDriverMarker([position.coords.latitude, position.coords.longitude]);
    }, () => {
      simulateDriverMovement(routePoints);
    }, {enableHighAccuracy:true, maximumAge:10000, timeout:10000});
  } else {
    simulateDriverMovement(routePoints);
  }
}

async function showActiveTripMap(){
  const tripId = Number(localStorage.getItem('rideguard_driver_trip_id') || 0);
  if(!tripId) return toast('No active trip selected', true);
  const trips = await loadDriverTrips(activeDriverId());
  const trip = trips.find(t => Number(t.id) === tripId) || trips[0];
  if(!trip) return toast('Active trip not found', true);
  const nextStopEl = document.getElementById('driverNextStop');
  const tripEnd = trip.trip_type === 'school_to_home' ? 'Home drop-off' : 'School drop-off';
  if(nextStopEl) nextStopEl.textContent = tripEnd;
  const routePoints = getDriverRoutePoints(trip);
  driverRouteDestination = routePoints[routePoints.length - 1];
  initDriverMap(trip);
}

async function refreshDriverView(){
  if(!document.getElementById('s-driver-dash')) return;
  renderDriverDashboard([]);
  removeTrackNavItems();
  renderDriverRequest([]);
  try {
    const driver = await ensureDriverSession();
    const [trips, profile] = await Promise.all([loadDriverTrips(driver.id), loadProfile(driver.id).catch(()=>null)]);
    renderDriverDashboard(trips, profile);
    removeTrackNavItems();
    renderDriverRequest(trips);
  } catch (err) {
    toast(err.message, true);
  }
}

function renderDriverDashboard(trips, profile = null){
  const screen = document.querySelector('#s-driver-dash .scroll-content');
  if(!screen) return;
  const active = trips.filter(t=>['pending','accepted','qr_verified','in_progress'].includes(t.status));
  const visibleActive = active.slice(0, 2);
  const hiddenActiveCount = Math.max(0, active.length - visibleActive.length);
  const driver = profile?.driver_profile || {};
  const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Driver';
  const vehicle = `${driver.make || 'Vehicle'} ${driver.model || ''}`.trim();
  screen.innerHTML = `
    <div style="background:linear-gradient(135deg,#29b6d9,#1565C0);border-radius:14px;padding:16px 18px;margin-bottom:14px">
      <div class="toggle-wrap"><div><div style="color:#fff;font-size:16px;font-weight:800">${name}</div><div style="color:rgba(255,255,255,0.8);font-size:12px">Online and accepting trips</div></div><div class="toggle ${Number(driver.is_online) ? '' : 'off'}" id="driverToggle" onclick="toggleDriver()"><div class="toggle-thumb"></div></div></div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <div style="flex:1;background:#dcfce7;border-radius:12px;padding:12px 10px;text-align:center"><div style="font-size:11px;color:#065f46;font-weight:600;margin-bottom:4px">Safety Score</div><div style="font-size:18px;font-weight:800;color:#065f46">${driver.safety_score || 98}%</div></div>
      <div style="flex:1;background:#dbeafe;border-radius:12px;padding:12px 10px;text-align:center"><div style="font-size:11px;color:var(--blue2);font-weight:600;margin-bottom:4px">Total Trips</div><div style="font-size:18px;font-weight:800;color:var(--blue2)">${driver.total_trips || 0}</div></div>
      <div style="flex:1;background:#fef9c3;border-radius:12px;padding:12px 10px;text-align:center"><div style="font-size:11px;color:#854d0e;font-weight:600;margin-bottom:4px">Rating</div><div style="font-size:18px;font-weight:800;color:#854d0e">${driver.rating || '5.0'}</div></div>
    </div>
    <div class="card card-shadow" style="margin-bottom:14px;display:flex;align-items:center;gap:12px">
      <div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Vehicle Information</div>
        <div style="display:flex;align-items:center;gap:12px">
          <svg width="28" height="20" viewBox="0 0 50 30" fill="none"><path d="M5 20 H45 L40 10 Q36 4 28 4 H22 Q14 4 10 10 Z" fill="#9ca3af"/><rect x="2" y="18" width="46" height="8" rx="4" fill="#6b7280"/><circle cx="14" cy="26" r="4" fill="#374151"/><circle cx="36" cy="26" r="4" fill="#374151"/></svg>
          <div><div style="font-size:14px;font-weight:700">${vehicle}</div><div style="font-size:12px;color:var(--text2)">License Plate: ${driver.plate_number || '-'}</div></div>
        </div>
      </div>
    </div>
    <div class="card card-shadow">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
        <div style="font-size:14px;font-weight:800">Trip Requests</div>
        ${hiddenActiveCount ? '<button class="rg-small-btn" onclick="go(\'s-trip-records\')">All</button>' : ''}
      </div>
      ${visibleActive.length ? visibleActive.map(t=>`
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;gap:10px"><div style="font-size:14px;font-weight:800">${t.student_first_name} ${t.student_last_name}</div>${statusBadge(t.status)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">${tripLabel(t.trip_type)} at ${formatTime(t.pickup_time)}</div>
          <button class="btn btn-blue" style="margin-top:8px;padding:10px;font-size:13px" onclick="openDriverTrip(${Number(t.id)})">${t.status === 'pending' ? 'View Request' : 'Continue Trip'}</button>
        </div>`).join('') : '<div class="rg-muted-state">No pending trip requests.</div>'}
    </div>
  `;
}

async function openDriverTrip(tripId){
  localStorage.setItem('rideguard_driver_trip_id', String(tripId));
  go('s-trip-request');
}

function renderDriverRequest(trips){
  const tripId = Number(localStorage.getItem('rideguard_driver_trip_id') || 0);
  const trip = trips.find(t=>Number(t.id) === tripId) || trips.find(t=>t.status === 'pending') || trips[0];
  const card = document.querySelector('#s-trip-request .card');
  if(!card) return;
  if(!trip){
    card.innerHTML = '<div class="rg-muted-state">No trip request selected.</div>';
    return;
  }
  localStorage.setItem('rideguard_driver_trip_id', String(trip.id));
  const name = `${trip.student_first_name} ${trip.student_last_name}`;
  replaceTextInScreen('s-qr-success', lastDriverChildName, name);
  replaceTextInScreen('s-trip-complete', lastDriverChildName, name);
  lastDriverChildName = name;
  card.innerHTML = `
    <div style="font-size:14px;font-weight:800;margin-bottom:14px">Trip Request</div>
    <div style="font-size:12px;color:var(--text2)">Student</div><div style="font-size:15px;font-weight:800;margin-bottom:10px">${trip.student_first_name} ${trip.student_last_name}</div>
    <div style="font-size:12px;color:var(--text2)">Scheduled Time</div><div style="font-size:15px;font-weight:800;margin-bottom:12px">${formatTime(trip.pickup_time)}</div>
    <div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:12px">
      <div style="font-size:11px;color:var(--text2)">Pickup Location</div><div style="font-size:13px;font-weight:700;margin-bottom:8px">${trip.pickup_address}</div>
      <div style="font-size:11px;color:var(--text2)">Dropoff Location</div><div style="font-size:13px;font-weight:700">${trip.dropoff_address}</div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-outline" onclick="go('s-driver-dash')" style="padding:13px">Back</button>
      <button class="btn btn-blue" onclick="acceptDriverTrip(${Number(trip.id)})" style="padding:13px">${trip.status === 'pending' ? 'Accept Trip' : 'Continue'}</button>
    </div>
  `;
}

async function acceptDriverTrip(tripId){
  await updateTrip('accepted', tripId);
  localStorage.setItem('rideguard_driver_trip_id', String(tripId));
  toast('Trip accepted');
  go('s-trip-accepted');
}

async function scanStudent(source){
  if (source === 'driver' && !activeDriverId()) {
    await ensureDriverSession();
  }
  if (source === 'guard' && !activeGuardId()) {
    await ensureGuardSession();
  }

  const tripId = Number(localStorage.getItem(source === 'driver' || source === 'driver_dropoff' ? 'rideguard_driver_trip_id' : 'rideguard_trip_id') || 0);

  let qrCode = lastScannedQrCode || '';
  if (source === 'guard' || source === 'driver' || source === 'driver_dropoff') {
    qrCode = qrCode || (window.prompt('Scan or enter student QR code') || '').trim();
    if (!qrCode) throw new Error('No QR code provided');
  }
  lastScannedQrCode = '';

  const payload = {
    student_id: null,
    qr_code: qrCode || null,
    guard_id: source === 'guard' ? (currentUser()?.role === 'guard' ? currentUser().id : activeGuardId() || null) : null,
    trip_id: tripId || null,
    phase: source === 'guard' ? currentScanPhase() : 'home_to_school',
    result: 'verified'
  };

  const res = await api('scans.php', {method:'POST', body:JSON.stringify(payload)});
  if (res && res.ok === false) throw new Error(res.error || 'Scan failed');
  setQrStatus(source, 'QR verified successfully.');
  toast('QR verified');
  return res;
}

async function submitRating(){
  const {user} = requireParentContext();
  const tripId = Number(localStorage.getItem('rideguard_trip_id') || 0);
  const driverId = Number(localStorage.getItem('rideguard_trip_driver_id') || selectedDriver().id || 0);
  if(!tripId) throw new Error('Schedule a trip before rating');
  const textarea = document.querySelector('#s-rating textarea');
  await api('ratings.php', {method:'POST', body:JSON.stringify({
    trip_id:tripId,
    parent_id:user.id,
    driver_id:driverId,
    score:currentRating || 5,
    comment:textarea ? textarea.value.trim() : ''
  })});
  toast('Rating saved');
  go('s-dashboard');
}

async function driverStatus(){
  const driver = await ensureDriverSession();
  const isOnline = !document.getElementById('driverToggle')?.classList.contains('off');
  await api('drivers.php', {method:'PATCH', body:JSON.stringify({driver_id:driver.id, is_online:isOnline ? 1 : 0})});
  toast(isOnline ? 'Driver is online' : 'Driver is offline');
}

function bindAction(screenId, text, handler, suppressInline = false){
  const screen = document.getElementById(screenId);
  if(!screen) return;
  const button = Array.from(screen.querySelectorAll('button')).find(btn => btn.textContent.trim().includes(text));
  if(!button) return;
  if(suppressInline) button.onclick = null;
  button.addEventListener('click', async (event)=>{
    event.preventDefault();
    try { await handler(); }
    catch (err) { toast(err.message, true); }
  });
}

async function refreshGuardScans(){
  const list = document.getElementById('guardScanList');
  if(!list) return;
  try {
    const guard = roleUser();
    const guardId = guard?.id || 0;
    if (!guardId) {
      list.innerHTML = '<div class="rg-muted-state">Login as a guard to view scans.</div>';
      return;
    }
    const data = await api(`scans.php?guard_id=${encodeURIComponent(guardId)}`).catch(()=>({scans:[]}));
    const scans = data.scans || [];
    if(!scans.length){
      list.innerHTML = '<div class="rg-muted-state">No scans recorded yet.</div>';
      return;
    }
    list.innerHTML = scans.slice(0,20).map(s=>{
      const verified = s.result === 'verified';
      const time = s.scanned_at ? new Date(s.scanned_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}) : '';
      const name = s.student_name || `Student #${s.student_id}`;
      return `<div class="scan-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10" stroke="${verified ? '#22c55e' : '#ef4444'}" stroke-width="2"/>
          ${verified ? '<path d="M8 12l3 3 5-5" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' : '<line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>'}
        </svg>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700">${name}</div>
          <div style="font-size:12px;color:${verified ? '#15803d' : '#dc2626'}">${verified ? 'Verified' : 'Failed — manual review needed'}</div>
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--text2);white-space:nowrap">${time}</div>
      </div>`;
    }).join('');
  } catch(err){
    list.innerHTML = '<div class="rg-muted-state">Could not load scans. Check your database connection.</div>';
  }
}

async function refreshGuardHistory(){
  const list = document.querySelector('#s-guard-history .scroll-content');
  if(!list) return;
  try {
    const guard = roleUser();
    const guardId = guard?.id || 0;
    if(!guardId){
      list.innerHTML = '<div class="rg-muted-state">Login as a guard to view trip history.</div>';
      return;
    }
    const data = await api(`scans.php?guard_id=${encodeURIComponent(guardId)}`).catch(()=>({scans:[]}));
    renderGuardTripHistory(data.scans || []);
  } catch(err){
    list.innerHTML = '<div class="rg-muted-state">Could not load guard trip history.</div>';
  }
}


// ── Named action handlers called directly from onclick ────────────────────────

window.doLogin = async function(){
  try { await loginParent(); } catch(err){ toast(err.message, true); }
};

window.doRegStep1 = async function(){
  try { validateRegisterStep(1); go('s-reg2'); } catch(err){ toast(err.message, true); }
};

window.doRegStep2 = async function(){
  try { validateRegisterStep(2); go('s-reg3'); } catch(err){ toast(err.message, true); }
};

window.doScheduleTrip = async function(){
  try { await scheduleTrip(); } catch(err){ toast(err.message, true); }
};

window.doSubmitRating = async function(){
  try { await submitRating(); } catch(err){ toast(err.message, true); }
};

window.doDriverQrScan = async function(){
  try {
    const res = await scanStudent('driver');
    // after successful scan, refresh trips to pick up student name
    const trips = await loadDriverTrips(activeDriverId());
    const tripId = Number(localStorage.getItem('rideguard_driver_trip_id') || 0);
    const trip = trips.find(t=>Number(t.id) === tripId) || trips[0];
    if(trip) {
      lastDriverChildName = `${trip.student_first_name} ${trip.student_last_name}`;
      localStorage.setItem('rideguard_trip_id', String(trip.id));
    }
    go('s-qr-success');
  } catch(err){ setQrStatus('driver', err.message || 'QR verification failed.', true); toast(err.message, true); }
};

window.doStartTrip = async function(){
  try {
    await updateTrip('in_progress', Number(localStorage.getItem('rideguard_driver_trip_id') || 0));
    toast('Trip started');
    go('s-active-trip');
  } catch(err){ toast(err.message, true); }
};

window.doDropoffScan = async function(){
  try {
    await scanStudent('driver_dropoff');
    const trips = await loadDriverTrips(activeDriverId());
    const tripId = Number(localStorage.getItem('rideguard_driver_trip_id') || 0);
    const trip = trips.find(t=>Number(t.id) === tripId);
    const nameEl = document.getElementById('dropoffStudentName');
    if(nameEl && trip) nameEl.textContent = `${trip.student_first_name} ${trip.student_last_name} confirmed at destination`;
    go('s-qr-dropoff-success');
  } catch(err){ setQrStatus('driver_dropoff', err.message || 'QR verification failed.', true); toast(err.message, true); }
};

window.doCompleteTrip = async function(){
  try {
    await updateTrip('completed', Number(localStorage.getItem('rideguard_driver_trip_id') || 0));
    toast('Trip completed');
    go('s-trip-complete');
  } catch(err){ toast(err.message, true); }
};

window.doGuardScan = async function(){
  try { await scanStudent('guard'); go('s-guard-scans'); } catch(err){ setQrStatus('guard', err.message || 'QR verification failed.', true); toast(err.message, true); }
};

window.guardLogin = async function(){
  try {
    await ensureGuardSession();
    go('s-guard-dash');
  } catch (err) {
    toast(err.message, true);
  }
};

document.addEventListener('DOMContentLoaded',function(){
  ensureUtilityScreens();
  replaceBrandLogos();
  removeTrackNavItems();
  ensureQrScannerControls();
  renderQrCodes();
  originalRegisterStepTwo = document.querySelector('#s-reg2 div[style*="overflow-y:auto"]')?.innerHTML || '';
  bindDriverSelection();
  bindUtilityNav();

  // Normalize driver bottom nav across driver pages
  if(document.getElementById('s-driver-dash')){
    document.querySelectorAll('.nav-bar').forEach(nav=>{
      nav.innerHTML = `
        <div class="nav-item" onclick="go('s-trip-records')"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 13h7v8H3z" stroke="var(--blue2)" stroke-width="1.6"/><path d="M14 3h7v18h-7z" stroke="var(--blue2)" stroke-width="1.6"/></svg><span class="nav-label">Trip Records</span></div>
        <div class="nav-item" onclick="go('s-trip-request')"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 8h18v2H3z" stroke="#999" stroke-width="1.6"/><path d="M3 12h18v2H3z" stroke="#999" stroke-width="1.6"/></svg><span class="nav-label">Requests</span></div>
        <div class="nav-item" onclick="openProfile()"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#999" stroke-width="2"/><circle cx="12" cy="7" r="4" stroke="#999" stroke-width="2"/></svg><span class="nav-label">Profile</span></div>
      `;
    });
  }

  if(document.getElementById('s-dashboard')) refreshParentView().catch(()=>{});
  if(document.getElementById('s-driver-dash')) refreshDriverView();
});
