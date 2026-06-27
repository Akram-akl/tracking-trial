// --- Constants ---
const LEVELS = APP_CONFIG.levels;

function getLabel(key) {
    const isAdult = state.currentLevel === 'ijazat';
    const labels = {
        'student': isAdult ? 'دارس' : 'طالب',
        'students': isAdult ? 'دارسين' : 'طلاب',
        'parent': isAdult ? 'الجوال الشخصي' : 'ولي الأمر',
        'parent_phone': isAdult ? 'رقم الجوال' : 'رقم ولي الأمر',
        'student_data': isAdult ? 'بيانات الدارس' : 'بيانات الطالب',
        'add_student': isAdult ? 'إضافة دارس جديد' : 'إضافة طالب جديد',
        'edit_student': isAdult ? 'تعديل بيانات الدارس' : 'تعديل بيانات الطالب',
        'transfer_student': isAdult ? 'نقل الدارس' : 'نقل الطالب',
        'leaderboard_sub': isAdult ? 'أفضل المتفاعلين أداءً' : 'أفضل الطلاب أداءً'
    };
    return labels[key] || key;
}



// --- State Management ---
const state = {
    isTeacher: false,
    isParent: false,          // NEW: Parent role
    parentPhone: null,        // NEW: Parent's phone for lookup
    parentStudents: [],       // NEW: Students found for parent
    currentLevel: null, // Null indicates not logged in
    currentView: 'home',
    students: [],
    competitions: [],
    groups: [],
    scores: [],
    darkMode: localStorage.getItem('darkMode') === 'true',
    studentPassword: null, // For student mode authentication persistence
    hideScoresFromStudent: false, // حجب الدرجات الإجمالية عن الطالب
    transferRequests: [], // طلبات النقل الخاصة بهذه الحلقة
    enableDirectGrading: true, // تفعيل لوحة المصدرين (الرصد المباشر)
    disableLeaderboard: false, // الغاء تفعيل لوحة المتصدرين نهائيا
};

// --- Supabase Realtime Listeners ---
let studentsUnsubscribe = null;
let competitionsUnsubscribe = null;
let activeGroupsUnsubscribe = null;
let scoresUnsubscribe = null;
let homeStudentsUnsubscribe = null;
let transferRequestsUnsubscribe = null;

// --- Global Error Handler for Debugging ---
window.onerror = function (msg, url, line, col, error) {
    var errorDiv = document.getElementById('error-display');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'error-display';
        errorDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:red;color:white;padding:10px;font-size:10px;z-index:9999;max-height:100px;overflow:auto;';
        document.body.appendChild(errorDiv);
    }
    errorDiv.innerHTML += '<div>Error: ' + msg + ' at ' + line + ':' + col + '</div>';
    return false;
};

// --- Helpers ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// --- Toast Notification ---
function showToast(msg, type = 'success') {
    const toast = $('#toast');
    const toastMsg = $('#toast-msg');
    if (!toast) return;

    // Reset classes - MAXIMUM Z-INDEX to ensure visibility over everything (including modals)
    toast.className = 'fixed top-20 inset-x-0 mx-auto w-max px-6 py-3 rounded-full shadow-lg z-[9999] transition-all duration-300 flex items-center gap-3 min-w-[200px] justify-center text-white';

    if (type === 'error') toast.classList.add('bg-red-600');
    else if (type === 'success') toast.classList.add('bg-green-600');
    else toast.classList.add('bg-gray-800');

    toastMsg.textContent = msg;
    toast.classList.remove('hidden', 'opacity-0', 'translate-y-[-20px]');

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-20px]');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const modalId = 'custom-confirm-' + Date.now();
        const html = `
            <div id="${modalId}" class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center border border-gray-100 dark:border-gray-700">
                    <div class="bg-blue-100 dark:bg-blue-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                        <i data-lucide="help-circle" class="w-8 h-8"></i>
                    </div>
                    <h3 class="font-bold text-lg mb-6 text-gray-800 dark:text-gray-100">${message}</h3>
                    <div class="flex gap-3">
                        <button id="btn-cancel-${modalId}" class="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-bold transition">إلغاء</button>
                        <button id="btn-confirm-${modalId}" class="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-lg transition">تأكيد</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        if (window.lucide) window.lucide.createIcons();
        const modal = document.getElementById(modalId);
        document.getElementById(`btn-cancel-${modalId}`).onclick = () => { modal.remove(); resolve(false); };
        document.getElementById(`btn-confirm-${modalId}`).onclick = () => { modal.remove(); resolve(true); };
    });
}

function toggleModal(id, show = true) {
    const modal = $(`#${id}`);
    if (!modal) return;
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}
window.closeModal = (id) => toggleModal(id, false);

// --- Image Compression Utility ---
async function compressImage(file, maxWidth = 150, maxHeight = 150, quality = 0.4) {
    if (!file) return null;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
}

// --- Authentication & Persistence ---

function loadAuth() {
    const savedLevel = localStorage.getItem('auth_level');
    const savedRole = localStorage.getItem('auth_role');
    const savedParentPhone = localStorage.getItem('auth_parent_phone');
    const savedStudentId = localStorage.getItem('auth_student_id');

    // Parent login
    if (savedRole === 'parent' && savedParentPhone) {
        state.isParent = true;
        state.parentPhone = savedParentPhone;
        return true;
    }

    if (savedLevel && LEVELS[savedLevel]) {
        state.currentLevel = savedLevel;
        state.isTeacher = savedRole === 'teacher';
        if (savedRole === 'student') {
            if (savedStudentId) {
                window._currentLoggedInStudentId = savedStudentId;
            } else {
                return false; // Incomplete student session, force logout to avoid bug
            }
        }
        return true; // Logged in
    }
    return false; // Not logged in
}

function saveAuth() {
    if (state.isParent && state.parentPhone) {
        localStorage.setItem('auth_role', 'parent');
        localStorage.setItem('auth_parent_phone', state.parentPhone);
    } else if (state.currentLevel) {
        localStorage.setItem('auth_level', state.currentLevel);
        localStorage.setItem('auth_role', state.isTeacher ? 'teacher' : 'student');
        if (!state.isTeacher && window._currentLoggedInStudentId) {
            localStorage.setItem('auth_student_id', window._currentLoggedInStudentId);
        }
    }
}

function logout() {
    // 1. Unsubscribe from all active listeners
    if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }
    if (competitionsUnsubscribe) { competitionsUnsubscribe(); competitionsUnsubscribe = null; }
    if (activeGroupsUnsubscribe) { activeGroupsUnsubscribe(); activeGroupsUnsubscribe = null; }
    if (window.levelSettingsUnsubscribe) { window.levelSettingsUnsubscribe(); window.levelSettingsUnsubscribe = null; }
    if (scoresUnsubscribe) { scoresUnsubscribe(); scoresUnsubscribe = null; }
    if (homeStudentsUnsubscribe) { homeStudentsUnsubscribe(); homeStudentsUnsubscribe = null; }
    if (transferRequestsUnsubscribe) { transferRequestsUnsubscribe(); transferRequestsUnsubscribe = null; }

    state.isTeacher = false;
    state.isParent = false;
    state.parentPhone = null;
    state.parentStudents = [];
    state.currentLevel = null;
    state.students = [];
    state.competitions = [];
    state.scores = [];
    state.activeWeekDays = ['sun', 'mon', 'tue', 'wed', 'thu']; // default
    state.hideScoresFromStudent = false;
    state.transferRequests = [];

    localStorage.removeItem('auth_level');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_parent_phone');

    // Show Auth Modal
    showAuthModal();
}

function showAuthModal() {
    // Hide App Content
    $('#app-content-wrapper').classList.add('hidden'); // We will wrap content in index.html
    $('#auth-overlay').classList.remove('hidden');
}

function handleLogin(type) {
    // type: 'student' | 'teacher' | 'parent'
    $('#auth-options-panel').classList.add('hidden');

    if (type === 'student') {
        $('#student-login-panel').classList.remove('hidden');
    } else if (type === 'parent') {
        $('#parent-login-panel').classList.remove('hidden');
    } else {
        $('#teacher-login-panel').classList.remove('hidden');
    }
}

function backToAuthHome() {
    $('#student-login-panel').classList.add('hidden');
    $('#teacher-login-panel').classList.add('hidden');
    $('#parent-login-panel').classList.add('hidden');
    $('#auth-options-panel').classList.remove('hidden');
}

async function verifyStudentLevel() {
    const levelKey = $('#student-level-select').value;

    if (!levelKey || !LEVELS[levelKey]) {
        showToast("الرجاء اختيار المرحلة", "error");
        return;
    }

    try {
        // Fetch students for this level directly (no level password needed)
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", levelKey)
        );
        const snap = await window.firebaseOps.getDocs(q);
        
        const students = [];
        snap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            students.push(data);
        });

        // Populate select
        const nameSelect = $('#student-name-select');
        nameSelect.innerHTML = '<option value="" disabled selected>-- اختر اسمك --</option>' + 
            students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        
        if(students.length === 0) {
            showToast("لا يوجد طلاب مسجلين في هذه المرحلة", "error");
            return;
        }

        // Store level for step 2
        window._tempStudentLevel = levelKey;
        window._tempLevelStudents = students;

        $('#student-step-1').classList.add('hidden');
        $('#student-step-2').classList.remove('hidden');
    } catch(e) {
        console.error(e);
        showToast("خطأ في تحميل بيانات الطلاب", "error");
    }
}

function performStudentLogin() {
    const studentId = $('#student-name-select').value;
    const personalPassword = $('#student-personal-password-input').value;

    if (!studentId) {
        showToast("الرجاء اختيار اسمك", "error");
        return;
    }

    const student = window._tempLevelStudents.find(s => s.id === studentId);
    
    if (!student) {
        showToast("طالب غير موجود", "error");
        return;
    }

    if (!student.password) {
        showToast("لم يتم تعيين كلمة مرور شخصية لك بعد، راجع المعلم", "error");
        return;
    }

    if (personalPassword === student.password) {
        state.currentLevel = window._tempStudentLevel;
        state.isTeacher = false;
        state.studentPassword = personalPassword;
        window._currentLoggedInStudentId = student.id; // Store current student
        completeLogin();
    } else {
        showToast("كلمة المرور الشخصية غير صحيحة", "error");
    }
}

async function performTeacherLogin() {
    const password = $('#teacher-password-input').value;
    const selectedLevel = $('#teacher-level-select').value;

    try {
        // 1. Check if it's a master password (server-side)
        const isMaster = await window.firebaseOps.rpc('verify_password', {
            p_level: '_global',
            p_role: 'teacher',
            p_password: password
        });

        if (isMaster) {
            if (selectedLevel) {
                finishTeacherLogin(selectedLevel);
            } else {
                // No level selected -> Show Level Selector Grid
                $('#teacher-password-section').classList.add('hidden');
                $('#teacher-level-selection').classList.remove('hidden');
                const container = $('#teacher-level-grid');
                container.innerHTML = Object.entries(LEVELS)
                    .filter(([key, config]) => !config.hidden)
                    .map(([key, config]) => `
                     <button onclick="finishTeacherLogin('${key}')" class="p-4 bg-emerald-50 dark:bg-gray-700 rounded-xl border border-emerald-100 dark:border-gray-600 hover:border-emerald-600 transition text-center">
                        <div class="text-2xl mb-2">${config.emoji}</div>
                        <div class="text-sm font-bold text-gray-800 dark:text-gray-100">${config.name}</div>
                     </button>
                `).join('');
            }
            return;
        }

        // 2. Strict Level Logic
        if (!selectedLevel) {
            showToast("الرجاء اختيار المرحلة أولاً", "error");
            return;
        }

        // Check level-specific password (server-side)
        const isValid = await window.firebaseOps.rpc('verify_password', {
            p_level: selectedLevel,
            p_role: 'teacher',
            p_password: password
        });

        if (isValid) {
            finishTeacherLogin(selectedLevel);
        } else {
            showToast("كلمة المرور غير صحيحة للمرحلة المختارة", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("خطأ في التحقق من كلمة المرور", "error");
    }
}

function finishTeacherLogin(levelKey) {
    state.currentLevel = levelKey;
    state.isTeacher = true;
    completeLogin();
}

// --- Parent Login ---
function normalizePhone(phone) {
    if (!phone) return '';
    // Remove all non-digits
    let cleaned = phone.replace(/[^0-9]/g, '');
    // Saudi format: 05xxxxxxxx -> 966xxxxxxxx
    if (cleaned.startsWith('05') && cleaned.length === 10) {
        cleaned = '966' + cleaned.substring(1);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
        cleaned = '966' + cleaned;
    }
    // For international numbers, keep as-is
    return cleaned;
}

// Helper: returns true if the value is a displayable image (base64 OR external URL)
function isImgSrc(src) {
    if (!src) return false;
    return src.startsWith('data:image') || src.startsWith('http') || src.startsWith('blob:');
}

async function performParentLogin() {
    const phoneInput = $('#parent-phone-input').value.trim();
    const phone = normalizePhone(phoneInput);

    if (!phone || phone.length < 9) {
        showToast("الرجاء إدخال رقم جوال صحيح", "error");
        return;
    }

    showToast("جاري البحث عن الطلاب...");

    try {
        // Search across ALL levels for students with this parentPhone
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("parentPhone", "==", phone)
        );

        const snap = await window.firebaseOps.getDocs(q);

        if (snap.empty) {
            showToast("لا يوجد طلاب مسجلين بهذا الرقم", "error");
            return;
        }

        // Found students
        state.parentStudents = [];
        snap.forEach(doc => {
            var dData = doc.data();
            dData.id = doc.id;
            state.parentStudents.push(dData);
        });

        state.isParent = true;
        state.parentPhone = phone;
        completeParentLogin();

    } catch (e) {
        console.error(e);
        showToast("خطأ في البحث", "error");
    }
}

function completeParentLogin() {
    saveAuth();
    $('#auth-overlay').classList.add('hidden');
    $('#app-content-wrapper').classList.remove('hidden');
    $('#loading').classList.add('hidden');
    $('#view-container').classList.remove('hidden');

    updateUIMode();

    // Start Global Sync (optional for parent, but good for shared level data if any)
    startGlobalDataSync();

    router.navigate('parent'); // NEW route for parent dashboard

    showToast(`مرحباً بك! تم العثور على ${state.parentStudents.length} طالب/طالبة`);
}

function completeLogin() {
    saveAuth();
    $('#auth-overlay').classList.add('hidden');
    $('#app-content-wrapper').classList.remove('hidden');

    // Update UI headers
    updateUIMode();

    // Start Global Sync
    startGlobalDataSync();

    // Load Data
    const startView = state.isParent ? 'parent' : (state.isTeacher ? 'home' : 'students');
    router.navigate(startView);

    showToast(`مرحباً بك في ${LEVELS[state.currentLevel].name}`);

    // Explicitly show content
    $('#loading').classList.add('hidden');
    $('#view-container').classList.remove('hidden');

    // Auto backup — runs silently in background after teacher login
    if (state.isTeacher) {
        setTimeout(() => checkAndRunAutoBackup(), 3000);
    }

    // Pre-load Quran Data to make search instant
    if (typeof QuranService !== 'undefined') {
        QuranService.loadData();
    }
}

function updateUIMode() {
    const btn = $('#mode-btn'); // This is now logout button or status
    const label = $('#current-mode-label');
    const badge = $('#level-badge');
    const header = $('header');
    const nav = $('nav');

    // Hide header/nav for parent mode
    if (state.isParent) {
        if (header) header.classList.add('hidden');
        if (nav) nav.classList.add('hidden');
        return; // Parent has its own UI
    } else {
        if (header) header.classList.remove('hidden');
        if (nav) nav.classList.remove('hidden');
    }

    const levelName = (LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '...');

    if (badge) {
        badge.textContent = levelName;
        badge.classList.remove('hidden');
    }

    if (state.isTeacher) {
        label.textContent = `${levelName} - معلم`;
        label.className = "text-xs text-yellow-300 font-bold";
        btn.innerHTML = '<i data-lucide="log-out" class="w-5 h-5"></i>';
        btn.onclick = logout; // Bind logout
        btn.className = "p-2 bg-red-800/80 rounded-full hover:bg-red-600 transition text-white border border-red-500/50";
    } else {
        label.textContent = `${levelName} - ${getLabel('student')}`;
        label.className = "text-xs text-emerald-300 mt-0.5";
        btn.innerHTML = '<i data-lucide="log-out" class="w-5 h-5"></i>'; // Also logout for student to switch level
        btn.onclick = logout;
        btn.className = "p-2 bg-emerald-800/80 rounded-full hover:bg-emerald-700 transition text-white border border-emerald-600/50";
    }

    // Toggle Home Nav button visibility for students based on disableLeaderboard
    const homeNavBtn = document.querySelector('.nav-item[data-target="home"]');
    if (homeNavBtn) {
        if (!state.isTeacher && state.disableLeaderboard) {
            homeNavBtn.style.display = 'none';
        } else {
            homeNavBtn.style.display = 'flex';
        }
    }


    refreshAllData();
}

function refreshAllData() {
    if (state.currentView === 'home') renderHome();
    if (state.currentView === 'competitions') renderCompetitions();
    if (state.currentView === 'students') renderStudents();
}

// --- Router ---
const router = {
    routes: {
        home: renderHome,
        competitions: renderCompetitions,
        students: renderStudents,
        settings: renderSettings,
        parent: renderParentDashboard,
        direct_grading: renderDirectGrading,
        plans: renderPlans
    },
    cleanup() {
        // Unsubscribe from all active VIEW-SPECIFIC listeners to prevent memory leaks/lag
        if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }
        if (scoresUnsubscribe) { scoresUnsubscribe(); scoresUnsubscribe = null; }
        if (homeStudentsUnsubscribe) { homeStudentsUnsubscribe(); homeStudentsUnsubscribe = null; }
        // Note: Global listeners (competitions, groups, settings) remain active until logout
    },
    // History-aware navigation
    navigate(view) {
        if (state.currentView === view) return;
        // Push to history
        history.pushState({ view: view }, '', `#${view}`);
        this.render(view);
    },

    // Render the view (internal)
    render(view) {
        // Cleanup previous view's listeners
        this.cleanup();

        state.currentView = view;
        $$('.nav-item').forEach(el => {
            const isActive = el.dataset.target === view;
            if (isActive) {
                el.classList.add('text-emerald-700', 'dark:text-emerald-400');
                el.classList.remove('text-gray-400');
            } else {
                el.classList.remove('text-emerald-700', 'dark:text-emerald-400');
                el.classList.add('text-gray-400');
            }
        });

        const container = $('#view-container');
        // Simple loading indicator for better UX
        container.innerHTML = '<div class="flex justify-center p-8"><i data-lucide="loader-2" class="animate-spin w-8 h-8 text-emerald-700"></i></div>';
        lucide.createIcons();

        // Small delay to allow UI to paint loading state if needed, or just execute
        setTimeout(() => {
            if (this.routes[view]) {
                this.routes[view]();
            }
        }, 10);
    }
};

// --- View Renderers ---

function renderHome() {
    const container = $('#view-container');

    const _isStudentView = (!state.isTeacher && !state.isParent);
    const _hideAggregated = state.disableLeaderboard || (state.hideScoresFromStudent && _isStudentView);

    container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
            ${!_hideAggregated ? `
            <div class="bg-gradient-to-br from-emerald-600 to-emerald-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div class="absolute -right-10 -top-10 bg-white/10 w-40 h-40 rounded-full blur-2xl"></div>
                <div class="absolute -left-10 -bottom-10 bg-black/10 w-40 h-40 rounded-full blur-2xl"></div>
                
                <div class="relative z-10 text-center">
                    <h2 class="text-2xl font-bold mb-1">لوحة المتصدرين</h2>
                    <p class="text-emerald-100 text-sm">${getLabel('leaderboard_sub')} - ${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</p>

                    
                    <div id="top-3-container" class="mt-6 flex justify-center gap-4">
                        <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-white"></i>
                    </div>
                </div>
            </div>
            ` : (state.disableLeaderboard ? '' : `
            <div class="bg-gradient-to-br from-emerald-600 to-emerald-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden text-center">
                <div class="absolute -right-10 -top-10 bg-white/10 w-40 h-40 rounded-full blur-2xl"></div>
                <i data-lucide="eye-off" class="w-10 h-10 mx-auto mb-2 opacity-70"></i>
                <h2 class="text-xl font-bold mb-1">${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</h2>
                <p class="text-emerald-200 text-sm">تم حجب الدرجات الإجمالية من قبل المعلم</p>
            </div>
            `)}

            ${state.isTeacher ? `
            <div class="grid grid-cols-3 gap-3">
                <button onclick="router.navigate('students')" class="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2 hover:border-emerald-600 transition">
                    <div class="bg-emerald-100 dark:bg-emerald-900/40 p-2.5 rounded-xl text-emerald-700 dark:text-emerald-400">
                        <i data-lucide="user-plus" class="w-5 h-5"></i>
                    </div>
                    <span class="font-medium text-[11px] sm:text-xs">إدارة ال${getLabel('students')}</span>
                </button>

                <button onclick="router.navigate('competitions')" class="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2 hover:border-emerald-600 transition">
                    <div class="bg-purple-100 dark:bg-purple-900/40 p-2.5 rounded-xl text-purple-600 dark:text-purple-400">
                        <i data-lucide="trophy" class="w-5 h-5"></i>
                    </div>
                    <span class="font-medium text-[11px] sm:text-xs">إدارة المسابقات</span>
                </button>
                <button onclick="openQuranSearchModal()" class="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2 hover:border-emerald-500 transition">
                    <div class="bg-emerald-100 dark:bg-emerald-900/40 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400">
                        <i data-lucide="book" class="w-5 h-5"></i>
                    </div>
                    <span class="font-medium text-[11px] sm:text-xs">بحث المصحف</span>
                </button>
            </div>
            ` : ''}

            ${!_hideAggregated ? `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-800 dark:text-gray-100">المجموعات المتميزة</h3>
                    <span class="text-emerald-700 text-xs font-bold bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-lg">الأعلى نقاطاً</span>
                </div>
                <div id="top-groups-list" class="space-y-3">
                     <div class="text-center py-4 text-gray-400 text-sm">جاري التحميل...</div>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    // Fetch GLOBAL students for leaderboard calculation, scoped to LEVEL
    if (homeStudentsUnsubscribe) homeStudentsUnsubscribe();

    // Query filtered by current level
    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "students"),
        window.firebaseOps.where("level", "==", state.currentLevel)
    );

    homeStudentsUnsubscribe = window.firebaseOps.onSnapshot(q, (snap) => {
        state.students = [];
        snap.forEach(function (d) {
            var data = d.data();
            data.id = d.id;
            state.students.push(data);
        });
        calculateLeaderboard();
    });

    if (scoresUnsubscribe) {
        scoresUnsubscribe();
    }

    // Listen to scores — FILTERED BY LEVEL for performance
    const scoresQuery = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "scores"),
        window.firebaseOps.where("level", "==", state.currentLevel)
    );
    scoresUnsubscribe = window.firebaseOps.onSnapshot(scoresQuery, (snapshot) => {
        const scores = [];
        snapshot.forEach(doc => scores.push(doc.data()));
        state.scores = scores;
        calculateLeaderboard();
    });

    lucide.createIcons();
}

// Debounced Leaderboard Calculation — prevents redundant recalculations
let _leaderboardTimeout = null;
function calculateLeaderboard() {
    if (_leaderboardTimeout) clearTimeout(_leaderboardTimeout);
    _leaderboardTimeout = setTimeout(_doCalculateLeaderboard, 400);
}

function _doCalculateLeaderboard() {
    // 0. Filter by Active Competition (if any)
    const activeComp = state.competitions.find(function (c) { return c.active; });

    // 1. Calculate Student Totals
    const studentTotals = state.students.map(function (student) {
        const myScores = state.scores.filter(function (s) {
            if (s.studentId !== student.id) return false;
            if (activeComp) return s.competitionId === activeComp.id;
            return true;
        });
        const total = myScores.reduce(function (sum, score) { return sum + parseFloat(score.points); }, 0);
        var sClone = Object.assign({}, student);
        sClone.totalScore = total;
        return sClone;
    }).sort(function (a, b) { return b.totalScore - a.totalScore; });

    updateTop3UI(studentTotals.slice(0, 3));

    // 2. Calculate Group Totals (students sum + group_scores bonus)
    const gq = window.firebaseOps.query(window.firebaseOps.collection(window.db, "groups"));
    window.firebaseOps.getDocs(gq).then(function (snap) {
        const allGroups = [];
        snap.forEach(function (d) {
            var data = d.data();
            data.id = d.id;
            allGroups.push(data);
        });

        const validGroups = allGroups.filter(function (g) {
            if (g.level && g.level !== state.currentLevel) return false;
            if (activeComp) return g.competitionId === activeComp.id;
            return true;
        });

        // Fetch group_scores for bonus points
        const gsq = window.firebaseOps.query(window.firebaseOps.collection(window.db, "group_scores"));
        window.firebaseOps.getDocs(gsq).then(function (gsSnap) {
            const groupBonusMap = {};
            gsSnap.forEach(function (d) {
                var gs = d.data();
                if (activeComp && gs.competitionId !== activeComp.id) return;
                if (!groupBonusMap[gs.groupId]) groupBonusMap[gs.groupId] = 0;
                groupBonusMap[gs.groupId] += (parseFloat(gs.points) || 0);
            });

            const groupTotals = validGroups.map(function (group) {
                var membersScore = 0;
                if (group.members) {
                    group.members.forEach(function (mId) {
                        var sItem = studentTotals.find(function (s) { return s.id === mId; });
                        membersScore += sItem ? sItem.totalScore : 0;
                    });
                }
                var bonusScore = groupBonusMap[group.id] || 0;
                var gFinal = Object.assign({}, group);
                gFinal.totalScore = membersScore + bonusScore;
                gFinal.bonusScore = bonusScore;
                return gFinal;
            }).sort(function (a, b) { return b.totalScore - a.totalScore; });

            updateTopGroupsUI(groupTotals.slice(0, 5));
        }).catch(function(err) {
            console.warn("Could not fetch group_scores (table may not exist yet):", err);
            // Fallback without group bonus points
            const groupTotals = validGroups.map(function (group) {
                var membersScore = 0;
                if (group.members) {
                    group.members.forEach(function (mId) {
                        var sItem = studentTotals.find(function (s) { return s.id === mId; });
                        membersScore += sItem ? sItem.totalScore : 0;
                    });
                }
                var gFinal = Object.assign({}, group);
                gFinal.totalScore = membersScore;
                gFinal.bonusScore = 0;
                return gFinal;
            }).sort(function (a, b) { return b.totalScore - a.totalScore; });

            updateTopGroupsUI(groupTotals.slice(0, 5));
        });
    });
}

function updateTop3UI(top3) {
    const container = $('#top-3-container');
    if (!container) return;

    if (top3.length === 0) {
        container.innerHTML = '<p class="text-white/70 text-sm pb-4">لا توجد بيانات بعد</p>';
        return;
    }

    // تصميم جديد أفضل - قائمة بسيطة وواضحة
    const medals = ['🥇', '🥈', '🥉'];
    const bgColors = ['bg-yellow-500/20', 'bg-gray-400/20', 'bg-orange-500/20'];

    container.innerHTML = `
        <div class="w-full space-y-2">
            ${top3.map((student, i) => {
        const iconHtml = isImgSrc(student.icon)
            ? `<img src="${student.icon}" class="w-full h-full object-cover">`
            : (student.icon || '👤');
        return `
                <div class="flex items-center gap-3 ${bgColors[i]} backdrop-blur-sm rounded-xl px-3 py-2">
                    <span class="text-xl">${medals[i]}</span>
                    <div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-lg overflow-hidden border-2 border-white/50 shrink-0">
                        ${iconHtml}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-white text-sm truncate">${student.name}</p>
                    </div>
                    <div class="bg-white/20 px-3 py-1 rounded-lg">
                        <span class="font-bold text-white">${student.totalScore}</span>
                        <span class="text-white/70 text-xs">نقطة</span>
                    </div>
                </div>
            `}).join('')}
        </div>
    `;
}

function updateTopGroupsUI(groups) {
    const list = $('#top-groups-list');
    if (!list) return;

    if (groups.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">لا توجد مجموعات</p>';
        return;
    }

    list.innerHTML = groups.map((g, i) => {
        const isImg = isImgSrc(g.icon);
        const iconHtml = isImg
            ? `<div class="w-10 h-10 rounded-full overflow-hidden border border-gray-200"><img src="${g.icon}" class="w-full h-full object-cover"></div>`
            : `<div class="text-2xl">${g.emoji || g.icon || '🛡️'}</div>`;

        return `
        <div class="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            ${iconHtml}
            <div class="flex-1">
                <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100">${g.name}</h4>
                <p class="text-xs text-gray-500">مجموع النقاط: ${g.totalScore}</p>
            </div>
            <span class="font-bold text-emerald-700 text-lg">#${i + 1}</span>
        </div>
    `}).join('');
}

function renderCompetitions() {
    const container = $('#view-container');
    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <div class="flex justify-between items-center mb-2">
                <h2 class="text-xl font-bold">المسابقات - ${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</h2>
                ${state.isTeacher ? `
                <button onclick="openAddCompetitionModal()" class="bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-emerald-800 transition flex items-center gap-2">
                    <i data-lucide="plus" class="w-4 h-4"></i>
                    جديد
                </button>
                ` : ''}
            </div>
            
            <div id="competitions-list" class="space-y-4 min-h-[100px] relative">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <i data-lucide="loader-2" class="w-8 h-8 text-emerald-700 animate-spin mx-auto mb-2"></i>
                    <p class="text-gray-500 text-sm">جاري التحميل...</p>
                </div>
            </div>
        </div>
        </div>
    `;

    // Ensure modals are in body
    ensureGlobalModals();

    // The data is already kept up-to-date by startGlobalDataSync(), so we just render it:
    updateCompetitionsListUI();
    lucide.createIcons();
}

function updateCompetitionsListUI() {
    const list = $('#competitions-list');
    if (!list) return;

    if (state.competitions.length === 0) {
        list.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
                <div class="inline-block p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                    <i data-lucide="trophy" class="w-8 h-8 text-gray-400"></i>
                </div>
                <h3 class="text-gray-900 dark:text-white font-bold">لا توجد مسابقات حالياً</h3>
                <p class="text-gray-500 text-sm mt-1">المسابقات التي يتم إنشاؤها ستظهر هنا</p>
            </div>
        `;
    } else {
        list.innerHTML = state.competitions.map(comp => `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 hover:shadow-md transition border border-transparent hover:border-emerald-100 dark:hover:border-emerald-900">
                <div class="flex items-center gap-4 mb-3">
                    <div class="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-2xl">
                        ${comp.icon || '🏆'}
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-900 dark:text-white">${comp.name}</h3>
                        <p class="text-xs text-gray-500">${comp.level ? (LEVELS[comp.level] ? LEVELS[comp.level].name : 'عام') : 'عام'}</p>
                    </div>
                ${state.isTeacher ? `
                <div class="mr-auto flex gap-1">
                    <button onclick="toggleCompetitionActive('${comp.id}')" class="p-2 rounded-lg transition ${comp.active ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300 hover:text-yellow-500 hover:bg-yellow-50'}" title="${comp.active ? 'نشطة (تظهر للطلاب)' : 'تفعيل للعرض'}">
                        <i data-lucide="star" class="w-4 h-4 ${comp.active ? 'fill-yellow-500' : ''}"></i>
                    </button>
                    <button onclick="openEditCompetition('${comp.id}')" class="p-2 text-emerald-700 hover:bg-emerald-50 rounded-lg transition" title="تعديل">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="resetCompetition('${comp.id}')" class="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition" title="تصفير الدرجات">
                        <i data-lucide="refresh-ccw" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteCompetition('${comp.id}')" class="p-2 text-red-400 hover:bg-red-50 rounded-lg transition" title="حذف">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
                ` : ''}
                </div>
                
                <div class="grid grid-cols-2 gap-2 mt-4">
                    ${state.isTeacher ? `
                    <button onclick="openGradingSession('${comp.id}')" class="bg-emerald-700 text-white py-2 rounded-xl text-sm font-bold hover:bg-emerald-800 transition flex items-center justify-center gap-2">
                        <i data-lucide="star" class="w-4 h-4"></i>
                        رصد درجات
                    </button>
                    ` : ''}
                     <button onclick="openManageGroups('${comp.id}', '${comp.name}')" class="${state.isTeacher ? '' : 'col-span-2'} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-xl text-sm font-bold hover:bg-gray-200 transition flex items-center justify-center gap-2">
                        <i data-lucide="users" class="w-4 h-4"></i>
                        المجموعات
                    </button>
                </div>
            </div>
        `).join('');
    }
    lucide.createIcons();
}

function renderStudents() {
    const container = $('#view-container');

    if (!state.isTeacher && !state.isParent && window._currentLoggedInStudentId) {
        window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "students", window._currentLoggedInStudentId))
            .then(docSnap => {
                if (state.currentView !== 'students') return; // Prevent async overwrite if user navigated away
                if(docSnap.exists()) {
                    window._currentStudentRecord = docSnap.data();
                    window._currentStudentRecord.id = docSnap.id;
                    openStudentReport(window._currentLoggedInStudentId);
                } else {
                    container.innerHTML = `<p class="text-center p-8">خطأ: لم يتم العثور على ${getLabel('student')}</p>`;
                }
            });
        return;
    }

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <div class="flex justify-between items-center mb-2 gap-2">
                <h2 class="text-xl font-bold">ال${getLabel('students')} - ${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</h2>

                ${state.isTeacher ? `
                <div class="flex gap-2 shrink-0">
                    <button onclick="openRegistrationLinkModal()" class="bg-gray-100 dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center gap-1 border border-gray-200 dark:border-gray-600" title="نسخ رابط التسجيل لل${getLabel('students')}">
                        <i data-lucide="link" class="w-4 h-4"></i>
                        رابط
                    </button>
                    <button onclick="openAddStudentModal()" class="bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-emerald-800 transition flex items-center gap-2">
                        <i data-lucide="user-plus" class="w-4 h-4"></i>
                        جديد
                    </button>
                </div>
                ` : ''}
            </div>

            <!-- Transfer Requests Container -->
            <div id="transfer-requests-container" class="space-y-2 mb-4"></div>

            <!-- Search Bar -->
            <div class="relative mb-2">
                <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" id="student-search-input" oninput="filterStudents(this.value)" 
                    class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:border-emerald-600 transition" 
                    placeholder="بحث بالاسم أو رقم الجوال...">
            </div>

            <div id="students-list" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden min-h-[100px] relative">
                <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                     <i data-lucide="loader-2" class="w-6 h-6 animate-spin mb-2"></i>
                     <p class="text-xs">جاري جلب ${getLabel('students')}...</p>
                </div>
            </div>
        </div>
        </div>
    `;

    // Ensure modals are in body
    ensureGlobalModals();

    // Performance: If we have cached data, show it immediately
    if (state.students && state.students.length > 0) {
        updateStudentsListUI();
    }
    updateTransferRequestsUI();

    // Listener
    if (studentsUnsubscribe) {
        studentsUnsubscribe();
        studentsUnsubscribe = null;
    }

    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "students"),
        window.firebaseOps.where("level", "==", state.currentLevel)
        // orderBy removed to avoid Index Error
    );

    studentsUnsubscribe = window.firebaseOps.onSnapshot(q, (snapshot) => {
        const students = [];
        snapshot.forEach((doc) => {
            var data = doc.data();
            data.id = doc.id;
            students.push(data);
        });
        // Client-side Sort (Supabase returns ISO strings for created_at)
        students.sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        state.students = students;
        updateStudentsListUI();
    });
}

function updateTransferRequestsUI() {
    const container = $('#transfer-requests-container');
    if (!container) return;

    if (!state.transferRequests || state.transferRequests.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    state.transferRequests.forEach(req => {
        // As Receiving Teacher (Pending Requests)
        if (req.toLevel === state.currentLevel && req.status === 'pending') {
            const fromLevelName = LEVELS[req.fromLevel] ? LEVELS[req.fromLevel].name : req.fromLevel;
            // Fetch student name from global db since it's not in our state
            html += `
                <div class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-fade-in" id="req-${req.id}">
                    <div class="flex items-start gap-3">
                        <div class="bg-blue-100 dark:bg-blue-800 p-2 rounded-lg text-blue-600 dark:text-blue-300">
                            <i data-lucide="arrow-right-left" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-blue-800 dark:text-blue-200">طلب نقل ${getLabel('student')} إليكم</p>
                            <p class="text-xs text-blue-600 dark:text-blue-400">يود معلم ${fromLevelName} نقل ${getLabel('student')} إلى حلقتكم.</p>
                            <div class="mt-1 text-xs font-medium text-gray-500" id="req-student-name-${req.id}">جاري جلب اسم ${getLabel('student')}...</div>
                            ${req.deleteOldData ? '<p class="text-[10px] text-red-500 font-bold mt-1">⚠️ سيتم حذف درجات الطالب القديمة عند القبول</p>' : ''}
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="acceptTransferRequest('${req.id}', '${req.studentId}', '${req.deleteOldData}', '${req.fromLevel}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow transition">قبول</button>
                        <button onclick="rejectTransferRequest('${req.id}')" class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-lg transition">رفض</button>
                    </div>
                </div>
            `;
            // Fetch student name async
            window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "students", req.studentId))
                .then(snap => {
                    const el = document.getElementById(`req-student-name-${req.id}`);
                    if (el && snap.exists()) el.innerText = `${getLabel('student')}: ` + snap.data().name;
                });
        }
        
        // As Originating Teacher (Rejected Notifications)
        if (req.fromLevel === state.currentLevel && req.status === 'rejected') {
            const toLevelName = LEVELS[req.toLevel] ? LEVELS[req.toLevel].name : req.toLevel;
            html += `
                <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-fade-in">
                    <div class="flex items-start gap-3">
                        <div class="bg-red-100 dark:bg-red-800 p-2 rounded-lg text-red-600 dark:text-red-300">
                            <i data-lucide="x-circle" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-red-800 dark:text-red-200">تم رفض النقل</p>
                            <p class="text-xs text-red-600 dark:text-red-400">رفض معلم ${toLevelName} استلام ${getLabel('student')}، وتم إبقاؤه في حلقتكم.</p>
                        </div>
                    </div>
                    <button onclick="dismissRejectedRequest('${req.id}')" class="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-lg transition">إخفاء</button>
                </div>
            `;
        }
    });

    container.innerHTML = html;
    lucide.createIcons();
}

async function acceptTransferRequest(requestId, studentId, deleteOldDataStr, fromLevel) {
    const isConfirmed = await showCustomConfirm(`هل أنت متأكد من قبول ${getLabel('student')} في حلقتكم؟`);
    if (!isConfirmed) return;
    const deleteOldData = (deleteOldDataStr === 'true');
    try {
        await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "students", studentId), { level: state.currentLevel, updatedAt: new Date().toISOString() });
        const groupsQ = window.firebaseOps.query(window.firebaseOps.collection(window.db, "groups"), window.firebaseOps.where("level", "==", fromLevel));
        const groupsSnap = await window.firebaseOps.getDocs(groupsQ);
        for (const doc of groupsSnap.docs) {
            const gData = doc.data();
            if (gData.members && gData.members.includes(studentId)) {
                await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "groups", doc.id), { members: gData.members.filter(m => m !== studentId) });
            }
        }
        if (deleteOldData) {
            const scoresQ = window.firebaseOps.query(window.firebaseOps.collection(window.db, "scores"), window.firebaseOps.where("studentId", "==", studentId));
            const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
            for (const sDoc of scoresSnap.docs) await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "scores", sDoc.id));
        }
        try {
            const plansQ = window.firebaseOps.query(window.firebaseOps.collection(window.db, 'student_plans'), window.firebaseOps.where('student_id', '==', studentId));
            const plansSnap = await window.firebaseOps.getDocs(plansQ);
            for (const planDoc of plansSnap.docs) {
                const dailyQ = window.firebaseOps.query(window.firebaseOps.collection(window.db, 'plan_daily_records'), window.firebaseOps.where('plan_id', '==', planDoc.id));
                const dailySnap = await window.firebaseOps.getDocs(dailyQ);
                for (const r of dailySnap.docs) await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, 'plan_daily_records', r.id));
                await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, 'student_plans', planDoc.id));
            }
        } catch (planError) { console.error('Failed to delete student plans on transfer:', planError); }

        // 4. Delete the request
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "transfer_requests", requestId));
        
        showToast(`تم قبول ونقل ${getLabel('student')} لحلقتكم بنجاح ✅`);
    } catch (e) {
        console.error("Error accepting transfer:", e);
        showToast(`حدث خطأ أثناء نقل ${getLabel('student')}`, "error");
    }
}

async function rejectTransferRequest(requestId) {
    const isConfirmed = await showCustomConfirm(`�� ��� ����� �� ��� ������ ${getLabel('student')}�`);
    if (!isConfirmed) return;
    try {
        await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "transfer_requests", requestId), {
            status: 'rejected',
            updatedAt: new Date().toISOString()
        });
        showToast("تم رفض الطلب");
    } catch(e) {
        showToast("حدث خطأ", "error");
    }
}

async function dismissRejectedRequest(requestId) {
    try {
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "transfer_requests", requestId));
    } catch(e) {
        console.error(e);
    }
}

function updateStudentsListUI() {
    const list = $('#students-list');
    if (!list) return;

    if (state.students.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <i data-lucide="users" class="w-12 h-12 mb-3 opacity-20"></i>
                <p class="text-sm font-medium">لا يوجد ${getLabel('students')} حتى الآن</p>
                ${state.isTeacher ? `<p class="text-xs mt-1">اضغط على "جديد" لإضافة ${getLabel('students')}</p>` : ''}
            </div>
        `;
    } else {
        list.innerHTML = state.students.map(student => {
            const isImg = isImgSrc(student.icon);
            const iconHtml = isImg
                ? `<img src="${student.icon}" class="w-full h-full object-cover">`
                : (student.icon || '👤');

            return `
            <div class="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition group border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div onclick="openStudentReport('${student.id}')" class="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-xl shadow-sm border border-gray-200 dark:border-gray-600 overflow-hidden cursor-pointer shrink-0">
                    ${iconHtml}
                </div>
                <div class="flex-1 min-w-0" onclick="openStudentReport('${student.id}')" style="cursor:pointer">
                    <h4 class="font-bold text-gray-800 dark:text-gray-100 truncate">${student.name}</h4>
                    <div class="flex flex-wrap gap-1 text-xs text-gray-500 mt-0.5">
                        ${(state.isTeacher && student.studentNumber) ? `<span class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] text-gray-500 tracking-wider">${student.studentNumber}</span>` : ''}
                        ${student.password ? '<span class="text-green-500">🔐</span>' : '<span class="text-orange-400">⚠️ بدون كلمة مرور</span>'}
                    </div>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="event.stopPropagation(); openEditStudent('${student.id}')" class="p-2 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition" title="تعديل">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    ${state.isTeacher ? `
                    <button onclick="event.stopPropagation(); confirmDeleteStudent('${student.id}')" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="حذف">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `}).join('');
        lucide.createIcons();
    }
}

// نقل الطالب لمرحلة أخرى - فتح نافذة الاختيار
function openTransferStudent(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    // Close any open modal (like rate-student-modal from direct grading)
    closeModal('rate-student-modal');

    // Build levels dropdown HTML
    let levelsHtml = '';
    Object.entries(LEVELS).forEach(([key, val]) => {
        if (key !== state.currentLevel && !val.hidden) {
            levelsHtml += `<option value="${key}">${val.name}</option>`;
        }
    });

    // Remove existing transfer modal if any
    const existingModal = document.getElementById('transfer-modal');
    if (existingModal) existingModal.remove();

    // Create dynamic transfer modal
    const modalHtml = `
        <div id="transfer-modal" class="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <div class="flex items-center gap-3 mb-4 text-blue-600 dark:text-blue-400">
                    <i data-lucide="arrow-right-left" class="w-6 h-6"></i>
                    <h3 class="text-lg font-bold">طلب نقل ال${getLabel('student')}: ${student.name}</h3>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-bold mb-1">إلى أي حلقة تريد نقل ال${getLabel('student')}؟</label>
                        <select id="transfer-to-level" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3">
                            <option value="">-- اختر الحلقة --</option>
                            ${levelsHtml}
                        </select>
                    </div>
                    
                    <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
                        <label class="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" id="transfer-delete-data" class="mt-1 w-4 h-4 text-red-600">
                            <div>
                                <span class="block text-sm font-bold text-red-800 dark:text-red-300">مسح بيانات ال${getLabel('student')} في حلقتي</span>
                                <span class="block text-xs text-red-600 dark:text-red-400 mt-1">إذا قمت بتحديد هذا الخيار، سيتم حذف جميع درجات ومراجعات ال${getLabel('student')} المسجلة باسم حلقتك (بشكل نهائي) بمجرد قبول المعلم الآخر للطلب. إذا تركته فارغاً سيتم الاحتفاظ بدرجاته كأرشيف لحلقتك.</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="flex gap-3 mt-6">
                    <button type="button" onclick="document.getElementById('transfer-modal').remove()" class="flex-1 py-3 rounded-xl text-gray-600 hover:bg-gray-100 font-bold transition">إلغاء</button>
                    <button type="button" onclick="submitTransferRequest('${studentId}', '${state.currentLevel}')" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2">
                        <i data-lucide="send" class="w-4 h-4"></i>
                        إرسال الطلب
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

// تأكيد نقل الطالب
async function confirmTransferStudent() {
    const studentId = $('#transfer-student-id').value;
    const targetLevel = $('#transfer-target-level').value;

    if (!studentId || !targetLevel) {
        showToast("يرجى اختيار المرحلة", "error");
        return;
    }

    try {
        await window.firebaseOps.updateDoc(
            window.firebaseOps.doc(window.db, "students", studentId),
            { level: targetLevel, updatedAt: new Date() }
        );
        showToast(`تم نقل ${getLabel('student')} إلى ${LEVELS[targetLevel].name}`);
        closeModal('transfer-modal');
    } catch (e) {
        console.error(e);
        showToast("فشل النقل", "error");
    }
}

function renderSettings() {
    const container = $('#view-container');

    // Load teacher info if teacher
    let teacherInfoHTML = '';
    if (state.isTeacher) {
        teacherInfoHTML = `
             <!-- Teacher Contact Info -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border">
                 <h3 class="font-bold mb-4 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5 text-purple-600"></i> المعلمون</h3>
                 <p class="text-xs text-gray-500 mb-3">${state.currentLevel === 'ijazat' ? 'بيانات التواصل للدارسين' : 'هذه البيانات ستظهر لولي الأمر للتواصل'}</p>
                 
                 <!-- Teachers List -->
                 <div id="teachers-list" class="space-y-2 mb-4">
                     <div class="text-center py-2 text-gray-400"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i></div>
                 </div>

                 <!-- Add New Teacher -->
                 <div class="border-t pt-4 mt-4">
                     <h4 class="font-bold text-sm mb-3 text-purple-600">➕ إضافة معلم جديد</h4>
                     <div class="space-y-3">
                         <div>
                             <label class="block text-sm font-bold mb-1">اسم المعلم</label>
                             <input type="text" id="teacher-name-setting" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2" placeholder="الأستاذ محمد">
                         </div>
                         <div>
                             <label class="block text-sm font-bold mb-1">رقم الجوال (WhatsApp)</label>
                             <input type="tel" id="teacher-phone-setting" dir="ltr" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2 text-left" placeholder="966xxxxxxxxx">
                             <p class="text-xs text-gray-400 mt-1">الأرقام السعودية: أدخل 966 أو 05</p>
                         </div>
                         <button onclick="addNewTeacher()" class="w-full py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition">
                             إضافة المعلم
                         </button>
                     </div>
                 </div>
             </div>
        `;
    }

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
             <h2 class="text-xl font-bold mb-4">الإعدادات</h2>
             
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
                 <div class="flex items-center justify-between">
                     <div class="flex items-center gap-3">
                         <div class="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
                             <i data-lucide="moon" class="w-5 h-5 text-gray-600 dark:text-gray-300"></i>
                         </div>
                         <span class="font-medium">الوضع الليلي</span>
                     </div>
                     <button onclick="toggleTheme()" class="w-12 h-7 bg-gray-200 dark:bg-emerald-700 rounded-full relative transition-colors duration-300">
                         <div class="w-5 h-5 bg-white rounded-full absolute top-1 left-1 dark:translate-x-5 transition-transform duration-300 shadow-sm"></div>
                     </button>
                 </div>
             </div>




             ${teacherInfoHTML}

             ${state.isTeacher ? `
             <!-- Export & Tools -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border">
                 <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="wrench" class="w-5 h-5 text-emerald-700"></i> أدوات</h3>
                 <div class="grid grid-cols-2 gap-3">
                     <button onclick="openReportsModal()" class="col-span-2 flex items-center justify-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 hover:bg-red-100 transition">
                         <i data-lucide="file-text" class="w-5 h-5 text-red-600"></i>
                         <span class="text-xs font-bold text-red-700 dark:text-red-400">إنشاء تقرير المجموعات (PDF)</span>
                     </button>
                     <button onclick="openBulkWhatsAppModal()" class="col-span-2 flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 transition">
                         <i data-lucide="message-circle" class="w-5 h-5 text-emerald-600"></i>
                         <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400">واتساب مجمع</span>
                     </button>
                     <button onclick="exportStudentsXLSX()" class="flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 transition">
                         <i data-lucide="file-spreadsheet" class="w-5 h-5 text-emerald-600"></i>
                         <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400">تصدير الطلاب</span>
                     </button>
                     <button onclick="openExportScoresModal()" class="flex items-center justify-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800 hover:bg-purple-100 transition">
                         <i data-lucide="file-spreadsheet" class="w-5 h-5 text-purple-600"></i>
                         <span class="text-xs font-bold text-purple-700 dark:text-purple-400">تصدير الدرجات</span>
                     </button>
                 </div>
             </div>
             ` : ''}

             ${state.isTeacher ? `
             <!-- Week Days Scheduling per Level -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border">
                 <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="calendar-days" class="w-5 h-5 text-emerald-600"></i> جدولة أيام الأسبوع</h3>
                 <p class="text-xs text-gray-500 mb-4">اختر الأيام التي ينعقد فيها النشاط لهذه المرحلة</p>
                 <div id="week-days-selector" class="grid grid-cols-7 gap-2 mb-4">
                     <button type="button" onclick="toggleWeekDay('sun')" id="day-sun" class="py-2 rounded-xl text-xs font-bold border-2 text-center transition">أحد</button>
                     <button type="button" onclick="toggleWeekDay('mon')" id="day-mon" class="py-2 rounded-xl text-xs font-bold border-2 text-center transition">اثنين</button>
                     <button type="button" onclick="toggleWeekDay('tue')" id="day-tue" class="py-2 rounded-xl text-xs font-bold border-2 text-center transition">ثلاثاء</button>
                     <button type="button" onclick="toggleWeekDay('wed')" id="day-wed" class="py-2 rounded-xl text-xs font-bold border-2 text-center transition">أربعاء</button>
                     <button type="button" onclick="toggleWeekDay('thu')" id="day-thu" class="py-2 rounded-xl text-xs font-bold border-2 text-center transition">خميس</button>
                     <button type="button" onclick="toggleWeekDay('fri')" id="day-fri" class="py-2 rounded-xl text-xs font-bold border-2 text-center transition">جمعة</button>
                     <button type="button" onclick="toggleWeekDay('sat')" id="day-sat" class="py-2 rounded-xl text-xs font-bold border-2 text-center transition">سبت</button>
                 </div>
                 <button onclick="saveWeekDays()" class="w-full py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-2">
                     <i data-lucide="save" class="w-4 h-4"></i> حفظ الجدولة
                 </button>
             </div>

             <!-- Hide Scores from Students -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border">
                 <div class="flex items-center justify-between">
                     <div class="flex items-center gap-3">
                         <div class="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg">
                             <i data-lucide="eye-off" class="w-5 h-5 text-red-600 dark:text-red-400"></i>
                         </div>
                         <div>
                             <span class="font-medium">حجب الدرجات الإجمالية</span>
                             <p class="text-[10px] text-gray-500">إخفاء لوحة المتصدرين والترتيب والمجموعات المتميزة عن الطالب</p>
                         </div>
                     </div>
                     <button id="hide-scores-toggle" onclick="toggleHideScoresFromStudent()" class="w-12 h-7 ${state.hideScoresFromStudent ? 'bg-red-600' : 'bg-gray-200 dark:bg-gray-600'} rounded-full relative transition-colors duration-300">
                         <div class="w-5 h-5 bg-white rounded-full absolute top-1 ${state.hideScoresFromStudent ? 'right-1' : 'left-1'} transition-all duration-300 shadow-sm"></div>
                     </button>
                 </div>
             </div>

             <!-- Disable Leaderboard -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border mt-4">
                 <div class="flex items-center justify-between">
                     <div class="flex items-center gap-3">
                         <div class="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg">
                             <i data-lucide="trophy" class="w-5 h-5 text-orange-600 dark:text-orange-400"></i>
                         </div>
                         <div>
                             <span class="font-medium">إلغاء تفعيل لوحة المتصدرين</span>
                             <p class="text-[10px] text-gray-500">إخفاء لوحة المتصدرين من الشاشة الرئيسية نهائياً</p>
                         </div>
                     </div>
                     <button id="disable-leaderboard-toggle" onclick="toggleDisableLeaderboard()" class="w-12 h-7 ${state.disableLeaderboard ? 'bg-orange-600' : 'bg-gray-200 dark:bg-gray-600'} rounded-full relative transition-colors duration-300">
                         <div class="w-5 h-5 bg-white rounded-full absolute top-1 ${state.disableLeaderboard ? 'left-6' : 'left-1'} transition-transform duration-300 shadow-sm"></div>
                     </button>
                 </div>
             </div>

             <!-- Enable Direct Grading Board -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border mt-4">
                 <div class="flex items-center justify-between">
                     <div class="flex items-center gap-3">
                         <div class="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg">
                             <i data-lucide="activity" class="w-5 h-5 text-emerald-600 dark:text-emerald-400"></i>
                         </div>
                         <div>
                             <span class="font-medium">تفعيل الرصد المباشر</span>
                             <p class="text-[10px] text-gray-500">إتاحة الرصد المباشر (غياب، حفظ، مراجعة، ملاحظات، نقل) للحلقة</p>
                         </div>
                     </div>
                     <button id="direct-grading-toggle" onclick="toggleEnableDirectGrading()" class="w-12 h-7 ${state.enableDirectGrading ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-600'} rounded-full relative transition-colors duration-300">
                         <div class="w-5 h-5 bg-white rounded-full absolute top-1 ${state.enableDirectGrading ? 'left-1' : 'right-1'} transition-all duration-300 shadow-sm"></div>
                     </button>
                 </div>
             </div>
             ` : ''}

             <!-- Bug Report / Suggestion -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border">
                 <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="message-square-warning" class="w-5 h-5 text-orange-600"></i> إبلاغ عن خطأ / اقتراح</h3>
                 <p class="text-xs text-gray-500 mb-3">سيتم إرسال بلاغك مباشرة إلى المبرمج ولن يظهر في التطبيق</p>
                 <div class="space-y-3">
                     <select id="feedback-type" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2 text-sm font-bold">
                         <option value="bug">🐛 إبلاغ عن خطأ</option>
                         <option value="suggestion">💡 اقتراح جديد</option>
                         <option value="other">💬 ملاحظة أخرى</option>
                     </select>
                     <textarea id="feedback-text" rows="3" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2 text-sm" placeholder="اكتب تفاصيل البلاغ أو الاقتراح هنا..."></textarea>
                     <button onclick="submitFeedback()" class="w-full py-2 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition flex items-center justify-center gap-2">
                         <i data-lucide="send" class="w-4 h-4"></i> إرسال البلاغ
                     </button>
                 </div>
             </div>

             <div class="text-center text-xs text-gray-400 mt-8 mb-4">
                 <p>برنامج المتابعة - إصدار v4.4.0</p>
                 <p class="opacity-50 mt-1 font-light">تم إنشاء هذا التطبيق بواسطة أكرم عقل</p>
             </div>
        </div>
    `;
    lucide.createIcons();

    // Load existing teachers list
    if (state.isTeacher) {
        loadTeachersList();
        loadWeekDays();
    }
}

function forceUpdateApp() {
    showToast("جاري التحديث الشامل...");

    // 1. Unregister all service workers if possible
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (var i = 0; i < registrations.length; i++) {
                registrations[i].unregister();
            }
        });
    }

    // 2. Clear caches
    if ('caches' in window) {
        caches.keys().then(function (names) {
            for (var name of names) caches.delete(name);
        });
    }

    // 3. Reload with force (cache: reload)
    setTimeout(function () {
        window.location.reload(true);
    }, 1000);
}

async function loadTeachersList() {
    const listContainer = $('#teachers-list');
    if (!listContainer) return;

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "teachers"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);

        if (snap.empty) {
            listContainer.innerHTML = '<p class="text-center text-gray-400 text-sm py-2">لا يوجد معلمون مسجلون حالياً</p>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const t = doc.data();
            html += `
            <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center text-lg">👨‍🏫</div>
                    <div>
                        <p class="font-bold text-sm">${t.name}</p>
                        <p class="text-xs text-gray-500" dir="ltr">${t.phone}</p>
                    </div>
                </div>
                <button onclick="deleteTeacher('${doc.id}')" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
            `;
        });

        listContainer.innerHTML = html;
        lucide.createIcons();
    } catch (e) {
        console.error("Error loading teachers:", e);
        listContainer.innerHTML = '<p class="text-center text-red-500 text-sm py-2">خطأ في تحميل البيانات</p>';
    }
}

async function addNewTeacher() {
    const nameEl = $('#teacher-name-setting');
    const phoneEl = $('#teacher-phone-setting');
    const name = nameEl ? nameEl.value.trim() : '';
    let phone = phoneEl ? phoneEl.value.trim() : '';

    if (!name || !phone) {
        showToast("الرجاء إدخال الاسم والرقم", "error");
        return;
    }

    // Normalize phone
    phone = normalizePhone(phone);

    try {
        const data = {
            name,
            phone,
            level: state.currentLevel,
            createdAt: new Date().toISOString()
        };

        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "teachers"), data);
        showToast("تم إضافة المعلم بنجاح ✅");

        // Clear inputs
        $('#teacher-name-setting').value = '';
        $('#teacher-phone-setting').value = '';

        // Reload list
        loadTeachersList();
    } catch (e) {
        console.error(e);
        showToast("خطأ في الإضافة", "error");
    }
}

async function deleteTeacher(teacherId) {
    // Create confirmation modal instead of confirm() which may not work in WebView
    let modal = document.getElementById('confirm-delete-teacher-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'confirm-delete-teacher-modal';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center">
            <div class="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                <i data-lucide="trash-2" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">حذف المعلم؟</h3>
            <p class="text-gray-500 text-sm mb-6">هل أنت متأكد من حذف هذا المعلم؟</p>
            <div class="flex gap-3">
                <button onclick="document.getElementById('confirm-delete-teacher-modal').remove()" class="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">إلغاء</button>
                <button onclick="confirmDeleteTeacher('${teacherId}')" class="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 shadow-lg">حذف</button>
            </div>
        </div>
    `;

    lucide.createIcons();
}

async function confirmDeleteTeacher(teacherId) {
    const teacherModal = document.getElementById('confirm-delete-teacher-modal');
    if (teacherModal) teacherModal.remove();
    try {
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "teachers", teacherId));
        showToast("تم حذف المعلم");
        loadTeachersList();
    } catch (e) {
        console.error(e);
        showToast("خطأ في الحذف", "error");
    }
}

// =====================================================
// FEATURE: Bug Report / Suggestion (Supabase feedback table)
// =====================================================
async function submitFeedback() {
    const typeEl = document.getElementById('feedback-type');
    const textEl = document.getElementById('feedback-text');
    const feedbackType = typeEl ? typeEl.value : 'other';
    const feedbackText = textEl ? textEl.value.trim() : '';

    if (!feedbackText) {
        showToast("يرجى كتابة تفاصيل البلاغ أو الاقتراح", "error");
        return;
    }

    try {
        const data = {
            type: feedbackType,
            message: feedbackText,
            level: state.currentLevel || 'unknown',
            role: state.isTeacher ? 'teacher' : (state.isParent ? 'parent' : 'student'),
            userAgent: navigator.userAgent,
            createdAt: new Date().toISOString()
        };

        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "feedback"), data);
        showToast("تم إرسال بلاغك بنجاح. شكراً لمساهمتك! 🙏", "success");
        if (textEl) textEl.value = '';
    } catch (e) {
        console.error("Error submitting feedback:", e);
        showToast("خطأ في إرسال البلاغ، حاول مرة أخرى", "error");
    }
}

// =====================================================
// FEATURE: Flexible Week Days Scheduling per Level
// =====================================================
let selectedWeekDays = [];

function toggleWeekDay(day) {
    const idx = selectedWeekDays.indexOf(day);
    if (idx === -1) {
        selectedWeekDays.push(day);
    } else {
        selectedWeekDays.splice(idx, 1);
    }
    updateWeekDayButtons();
}

function updateWeekDayButtons() {
    const allDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    allDays.forEach(d => {
        const btn = document.getElementById(`day-${d}`);
        if (!btn) return;
        if (selectedWeekDays.includes(d)) {
            btn.className = 'py-2 rounded-xl text-xs font-bold border-2 text-center transition border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
        } else {
            btn.className = 'py-2 rounded-xl text-xs font-bold border-2 text-center transition border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500';
        }
    });
}
function loadWeekDays() {
    if (!state.currentLevel) return;
    selectedWeekDays = state.activeWeekDays ? [...state.activeWeekDays] : ['sun', 'mon', 'tue', 'wed', 'thu'];
    updateWeekDayButtons();
}

async function saveWeekDays() {
    if (!state.currentLevel) return;
    
    if (selectedWeekDays.length === 0) {
        showToast("يرجى اختيار يوم واحد على الأقل", "error");
        return;
    }

    try {
        // Check if setting exists for this level + feature
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "level_settings"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);

        // Find existing week_days record
        let existingDocId = null;
        if (!snap.empty) {
            snap.forEach(doc => {
                const data = doc.data();
                if (data.featureName === 'week_days') {
                    existingDocId = doc.id;
                }
            });
        }

        const data = {
            level: state.currentLevel,
            featureName: 'week_days',
            isEnabled: true,
            settings: { activeDays: selectedWeekDays },
            updatedAt: new Date().toISOString()
        };

        if (existingDocId) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "level_settings", existingDocId), data);
        } else {
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "level_settings"), data);
        }

        // Update state immediately so reports use the new schedule right away
        state.activeWeekDays = [...selectedWeekDays];
        showToast("تم حفظ جدولة الأيام بنجاح ✅");
    } catch (e) {
        console.error("Error saving week days:", e);
        const errMsg = e.message || e.error_description || JSON.stringify(e);
        showToast("خطأ في حفظ الجدولة: " + errMsg, "error");
    }
}

// Toggle Hide Scores from Students
async function toggleHideScoresFromStudent() {
    if (!state.currentLevel) return;

    const newValue = !state.hideScoresFromStudent;

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "level_settings"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);

        let existingDocId = null;
        if (!snap.empty) {
            snap.forEach(doc => {
                const data = doc.data();
                if (data.featureName === 'hide_scores') {
                    existingDocId = doc.id;
                }
            });
        }

        const data = {
            level: state.currentLevel,
            featureName: 'hide_scores',
            isEnabled: newValue,
            settings: { hideScores: newValue },
            updatedAt: new Date().toISOString()
        };

        if (existingDocId) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "level_settings", existingDocId), data);
        } else {
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "level_settings"), data);
        }

        state.hideScoresFromStudent = newValue;
        showToast(newValue ? `تم حجب الدرجات الإجمالية عن ال${getLabel('student')} 🔒` : `تم إظهار الدرجات الإجمالية لل${getLabel('student')} 🔓`);


        // Update toggle UI
        const toggleBtn = document.getElementById('hide-scores-toggle');
        if (toggleBtn) {
            toggleBtn.className = `w-12 h-7 ${newValue ? 'bg-red-600' : 'bg-gray-200 dark:bg-gray-600'} rounded-full relative transition-colors duration-300`;
            toggleBtn.innerHTML = `<div class="w-5 h-5 bg-white rounded-full absolute top-1 ${newValue ? 'right-1' : 'left-1'} transition-all duration-300 shadow-sm"></div>`;
        }
    } catch (e) {
        console.error("Error toggling hide scores:", e);
        showToast("خطأ في حفظ الإعداد", "error");
    }
}

// Toggle Disable Leaderboard Completely
async function toggleDisableLeaderboard() {
    if (!state.currentLevel) return;

    const newValue = !state.disableLeaderboard;

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "level_settings"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);

        let existingDocId = null;
        if (!snap.empty) {
            snap.forEach(doc => {
                const data = doc.data();
                if (data.featureName === 'disable_leaderboard') {
                    existingDocId = doc.id;
                }
            });
        }

        const data = {
            level: state.currentLevel,
            featureName: 'disable_leaderboard',
            isEnabled: newValue,
            settings: { disable: newValue },
            updatedAt: new Date().toISOString()
        };

        if (existingDocId) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "level_settings", existingDocId), data);
        } else {
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "level_settings"), data);
        }

        state.disableLeaderboard = newValue;
        showToast(newValue ? "تم إلغاء تفعيل لوحة المتصدرين" : "تم تفعيل لوحة المتصدرين");

        // Update toggle UI
        const toggleBtn = document.getElementById('disable-leaderboard-toggle');
        if (!toggleBtn) return;
        
        const toggleDot = toggleBtn.querySelector('div');
        if (newValue) {
            toggleBtn.classList.remove('bg-gray-200', 'dark:bg-gray-600');
            toggleBtn.classList.add('bg-orange-600');
            toggleDot.classList.remove('left-1');
            toggleDot.classList.add('left-6');
        } else {
            toggleBtn.classList.remove('bg-orange-600');
            toggleBtn.classList.add('bg-gray-200', 'dark:bg-gray-600');
            toggleDot.classList.remove('left-6');
            toggleDot.classList.add('left-1');
        }
        
        if (state.currentView === 'home') renderHome();
    } catch (e) {
        console.error("Error toggling disable leaderboard:", e);
        showToast("خطأ في التحديث", "error");
    }
}

// Toggle Enable Direct Grading
async function toggleEnableDirectGrading() {
    if (!state.currentLevel) return;

    const newValue = !state.enableDirectGrading;

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "level_settings"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);

        let existingDocId = null;
        if (!snap.empty) {
            snap.forEach(doc => {
                const data = doc.data();
                if (data.featureName === 'direct_grading') {
                    existingDocId = doc.id;
                }
            });
        }

        const data = {
            level: state.currentLevel,
            featureName: 'direct_grading',
            isEnabled: newValue,
            updatedAt: new Date().toISOString()
        };

        if (existingDocId) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "level_settings", existingDocId), data);
        } else {
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "level_settings"), data);
        }

        state.enableDirectGrading = newValue;
        showToast(newValue ? "تم تفعيل لوحة المصدرين" : "تم تعطيل لوحة المصدرين");
        
        // Update Bottom Nav if teacher
        if (state.isTeacher) {
            const dgNav = document.getElementById('nav-direct-grading');
            if (dgNav) {
                dgNav.style.display = state.enableDirectGrading ? 'flex' : 'none';
            }
        }

        renderSettings(); // Re-render to update the toggle visual
    } catch (e) {
        console.error(e);
        showToast("خطأ في تحديث الإعداد", "error");
    }
}


function toggleTheme() {
    state.darkMode = !state.darkMode;
    applyTheme();
    localStorage.setItem('darkMode', state.darkMode);
}

function applyTheme() {
    if (state.darkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}



// --- Modals HTML generation to keep JS clean ---
// Implement Data Wipe Functions here (Global Scope)
// Data Wipe Functions Removed per user request

function getStudentModalHTML() {
    return `
    <div id="student-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
        <div class="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 shadow-2xl h-[90vh] sm:h-auto overflow-y-auto">
             <h3 id="student-modal-title" class="text-lg font-bold mb-6">${getLabel('add_student')}</h3>

             <form id="student-form" onsubmit="handleSaveStudent(event)">
                 <input type="hidden" id="student-id">
                 
                 <div class="mb-4 flex flex-col items-center gap-3">
                        <div id="student-emoji-preview" class="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-4xl shadow-inner border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden">
                            👤
                        </div>
                        <div class="flex gap-2">
                             <button type="button" onclick="openImagePicker()" class="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-100 transition">
                                 <i data-lucide="image" class="w-4 h-4"></i>
                                 رفع صورة
                             </button>
                             <button type="button" onclick="openEmojiPicker()" class="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl text-sm font-medium hover:bg-amber-100 transition">
                                 <i data-lucide="smile" class="w-4 h-4"></i>
                                 إيموجي
                             </button>
                        </div>
                        <input type="file" id="student-image-upload" accept="image/*" class="hidden" onchange="previewStudentImage(this)">
                        <input type="hidden" id="student-emoji" value="👤">
                 </div>

                 <div class="space-y-3">
                     <div>
                         <label class="block text-sm font-bold mb-1">اسم ${getLabel('student')}</label>
                         <input type="text" id="student-name" required class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3">
                     </div>

                     <div>
                         <label class="block text-sm font-bold mb-1">${getLabel('parent_phone')} (واتساب)</label>
                         <input type="tel" id="student-number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3" placeholder="مثال: 966500000000">
                         <p class="text-xs text-gray-400 mt-1">${state.currentLevel === 'ijazat' ? 'يستخدم للتواصل والمتابعة عبر واتساب' : 'يستخدم للتواصل عبر واتساب عند الغياب'}</p>
                     </div>
                     
                     <div class="grid grid-cols-2 gap-3 mt-1">
                         <div>
                             <label class="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">رقم الهوية</label>
                             <input type="text" id="student-national-id" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3 text-sm">
                         </div>
                             <div>
                                 <label class="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">آخر اختبار جمعية</label>
                                 <select id="student-last-exam" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3 text-sm">
                                     <option value="لم يختبر">لم يختبر</option>
                                     <option value="1">1</option>
                                     <option value="2">2</option>
                                     <option value="3">3</option>
                                     <option value="5">5</option>
                                     <option value="8">8</option>
                                     <option value="10">10</option>
                                     <option value="13">13</option>
                                     <option value="15">15</option>
                                     <option value="20">20</option>
                                     <option value="25">25</option>
                                     <option value="30">30 (خاتم)</option>
                                 </select>
                             </div>
                     </div>
                     
                     <input type="hidden" id="student-memorization">
                     <input type="hidden" id="student-review">


                     
                     <div class="mb-2">
                         <label class="block text-sm font-bold mb-1">كلمة المرور</label>
                         <input type="text" id="student-password-edit" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3" placeholder="كلمة المرور (إلزامي لل${getLabel('students')} الجدد)">
                         <p id="password-error" class="hidden text-red-500 text-xs mt-1 font-bold">⚠️ كلمة المرور مطلوبة لل${getLabel('student')} الجديد</p>
                     </div>
                     
                     <div class="flex gap-3 mt-6">
                         <button type="button" onclick="closeModal('student-modal')" class="flex-1 py-3 rounded-xl text-gray-600 hover:bg-gray-100 font-bold transition">إلغاء</button>
                         <button type="submit" id="save-student-btn" class="flex-1 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-800 transition"><span id="save-student-text">حفظ</span></button>
                     </div>
                     
                     <div id="transfer-student-section" class="hidden mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                         <button type="button" onclick="openTransferModal()" class="w-full py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl font-bold transition flex items-center justify-center gap-2">
                             <i data-lucide="arrow-right-left" class="w-4 h-4"></i>
                             طلب نقل ${getLabel('student')} لحلقة أخرى
                         </button>
                     </div>
                 </div>
             </form>
        </div>
    </div>
    `;
}

// فتح اختيار الصورة من المعرض
function openImagePicker() {
    document.getElementById('student-image-upload').click();
}

// فتح اختيار الإيموجي
function openEmojiPicker() {
    const emojis = ["👤", "🎓", "🏆", "🌟", "📚", "🕌", "⚽", "🧠", "⚔️", "🛡️", "🎒", "🧸", "👦", "👧", "👨‍🎓", "👩‍🎓", "🦁", "🐯", "🦅", "🐎", "🌙", "☀️", "⭐", "🚀", "💪", "🎯", "📖", "✏️", "🎨", "🧑"];

    const existingModal = document.getElementById('dynamic-emoji-modal');
    if (existingModal) existingModal.remove();

    const gridHtml = emojis.map(e => `
        <button type="button" onclick="selectEmoji('${e}')" class="w-12 h-12 text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition flex items-center justify-center">
            ${e}
        </button>
    `).join('');

    const modalHtml = `
    <div id="dynamic-emoji-modal" style="z-index: 999999;" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-4 shadow-2xl">
            <h3 class="font-bold text-center mb-4">اختر إيموجي</h3>
            <div class="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                ${gridHtml}
            </div>
            <button type="button" onclick="document.getElementById('dynamic-emoji-modal').remove()" class="w-full mt-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 font-medium transition">إغلاق</button>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// اختيار إيموجي
function selectEmoji(emoji) {
    document.getElementById('student-emoji').value = emoji;
    document.getElementById('student-emoji-preview').innerHTML = emoji;
    document.getElementById('student-image-upload').value = '';
    const modal = document.getElementById('dynamic-emoji-modal');
    if (modal) modal.remove();
}

// فتح اختيار الإيموجي للتسجيل الذاتي
function openIconPickerForRegistration() {
    const emojis = ["👤", "🎓", "🏆", "🌟", "📚", "🕌", "⚽", "🧠", "⚔️", "🛡️", "🎒", "🧸", "👦", "👧", "👨‍🎓", "👩‍🎓", "🦁", "🐯", "🦅", "🐎", "🌙", "☀️", "⭐", "🚀", "💪", "🎯", "📖", "✏️", "🎨", "🧑"];

    const existingModal = document.getElementById('dynamic-emoji-modal');
    if (existingModal) existingModal.remove();

    const gridHtml = emojis.map(e => `
        <button type="button" onclick="selectEmojiForRegistration('${e}')" class="w-12 h-12 text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition flex items-center justify-center">
            ${e}
        </button>
    `).join('');

    const modalHtml = `
    <div id="dynamic-emoji-modal" style="z-index: 999999;" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-4 shadow-2xl">
            <h3 class="font-bold text-center mb-4">اختر إيموجي</h3>
            <div class="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                ${gridHtml}
            </div>
            <button type="button" onclick="document.getElementById('dynamic-emoji-modal').remove()" class="w-full mt-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 font-medium transition">إغلاق</button>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function selectEmojiForRegistration(emoji) {
    window._selectedAddStudentIcon = emoji;
    const iconContainer = document.getElementById('self-reg-selected-icon');
    if (iconContainer) {
        iconContainer.innerHTML = emoji + `
        <div class="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>`;
    }
    const modal = document.getElementById('dynamic-emoji-modal');
    if (modal) modal.remove();
}


async function previewStudentImage(input) {
    if (input.files && input.files[0]) {
        const compressed = await compressImage(input.files[0]);
        const preview = document.getElementById('student-emoji-preview');
        preview.innerHTML = `<img src="${compressed}" class="w-full h-full object-cover">`;
        // مسح قيمة الإيموجي لأن الصورة أولوية
        document.getElementById('student-emoji').value = '';
    }
}

function getCompetitionModalsHTML() {
    // Similar to student modal but for competitions + groups
    return `
                            <div id="competition-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
                                <div class="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                                    <div class="flex justify-between items-center mb-6">
                                        <h3 class="text-lg font-bold">إنشاء مسابقة جديدة</h3>
                                        <button onclick="closeModal('competition-modal')"><i data-lucide="x"></i></button>
                                    </div>
                                    <form id="competition-form" onsubmit="handleSaveCompetition(event)">
                                        <input type="hidden" id="competition-id">
                                            <div class="flex gap-4 mb-4">
                                                <div class="relative group cursor-pointer shrink-0" onclick="toggleEmojiPicker('competition-emoji-btn')">
                                                    <div id="competition-emoji-preview" class="w-16 h-16 bg-emerald-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-emerald-300 flex items-center justify-center text-3xl">🏆</div>
                                                    <input type="hidden" id="competition-emoji" value="🏆">
                                                </div>
                                                <div class="flex-1">
                                                    <label class="block text-sm font-bold mb-1">اسم المسابقة</label>
                                                    <input type="text" id="competition-name" required class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3">
                                                </div>
                                            </div>

                                            <div class="mb-4">
                                                <label class="block text-sm font-bold mb-2">معايير التقييم</label>
                                                <div id="criteria-list" class="space-y-2 mb-2"></div>
                                                <button type="button" onclick="addCriteriaItem()" class="text-emerald-700 text-sm font-bold flex items-center gap-1">+ إضافة معيار</button>
                                            </div>



                                            <div class="mb-4 bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-800">
                                                <h4 class="font-bold text-sm text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
                                                    <i data-lucide="user-x" class="w-4 h-4"></i>
                                                    إعدادات خصم الغياب
                                                </h4>
                                                <div class="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label class="block text-xs font-bold mb-1">بعذر (نقاط)</label>
                                                        <input type="number" id="comp-absent-excuse" step="0.25" class="w-full bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2 text-center" value="1">
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-bold mb-1">بدون عذر (نقاط)</label>
                                                        <input type="number" id="comp-absent-no-excuse" step="0.25" class="w-full bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2 text-center" value="4">
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div class="mb-4 bg-purple-50 dark:bg-purple-900/10 p-3 rounded-xl border border-purple-100 dark:border-purple-800">
                                                <h4 class="font-bold text-sm text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
                                                    <i data-lucide="zap" class="w-4 h-4"></i>
                                                    إعدادات يوم النشاط
                                                </h4>
                                                <div class="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label class="block text-[10px] font-bold mb-1">نقاط الحضور</label>
                                                        <input type="number" id="comp-activity-points" step="0.25" class="w-full bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 rounded-lg px-3 py-2 text-center text-sm" value="">
                                                    </div>
                                                    <div>
                                                        <label class="block text-[10px] font-bold mb-1 text-red-600">نقاط الخصم (غائب)</label>
                                                        <input type="number" id="comp-activity-absent-points" step="0.25" class="w-full bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 text-center text-sm text-red-600" value="">
                                                    </div>
                                                </div>
                                            </div>

                                            <button type="submit" id="save-competition-btn" class="w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-800 transition">حفظ المسابقة</button>
                                    </form>
                                </div>
                            </div>

                            <div id="groups-modal" class="fixed inset-0 bg-black/50 z-[50] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-0 shadow-2xl max-h-[80vh] flex flex-col">
                                    <div class="p-4 border-b flex justify-between shrink-0">
                                        <div><h3 class="font-bold">إدارة المجموعات</h3><p id="groups-comp-name" class="text-xs text-gray-500"></p></div>
                                        <button onclick="closeModal('groups-modal')"><i data-lucide="x"></i></button>
                                    </div>
                                    <div class="p-4 flex-1 overflow-y-auto">
                                        <button id="add-group-btn" onclick="openAddGroupModal()" class="w-full py-3 border-2 border-dashed border-emerald-300 text-emerald-700 rounded-xl font-bold mb-4 hover:bg-emerald-50 transition hidden">+ مجموعة جديدة</button>
                                        <div id="groups-container" class="space-y-3"></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Add/Edit Group Modal -->
                            <div id="edit-group-modal" class="fixed inset-0 bg-black/60 z-[50] hidden flex items-center justify-center p-4">
                                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                                    <div class="flex justify-between items-center mb-4">
                                        <h3 id="group-modal-title" class="font-bold text-lg">إضافة مجموعة</h3>
                                        <button onclick="closeModal('edit-group-modal')" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                                    </div>

                                    <input type="hidden" id="edit-group-id">

                                        <!-- Group Icon -->
                                        <div class="flex items-center gap-4 mb-4">
                                            <div id="group-icon-preview" class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-3xl border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer" onclick="document.getElementById('group-image-upload').click()">
                                                🛡️
                                            </div>
                                            <div class="flex-1">
                                                <input type="text" id="edit-group-name" placeholder="اسم المجموعة" class="w-full mb-2 bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2">
                                                    <div class="flex gap-2">
                                                        <button type="button" onclick="document.getElementById('group-image-upload').click()" class="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg hover:bg-emerald-100">📷 صورة</button>
                                                        <button type="button" onclick="cycleGroupEmoji()" class="text-xs bg-amber-50 text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-100">😊 إيموجي</button>
                                                    </div>
                                            </div>
                                        </div>
                                        <input type="file" id="group-image-upload" accept="image/*" class="hidden" onchange="previewGroupImage(this)">
                                            <input type="hidden" id="group-icon" value="🛡️">

                                                <!-- Leader & Deputy -->
                                                <div class="grid grid-cols-2 gap-3 mb-4">
                                                    <div>
                                                        <label class="block text-xs font-bold text-gray-500 mb-1">👑 القائد</label>
                                                        <select id="group-leader" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-2 text-sm">
                                                            <option value="">-- اختر --</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-bold text-gray-500 mb-1">⭐ النائب</label>
                                                        <select id="group-deputy" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-2 text-sm">
                                                            <option value="">-- اختر --</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <!-- Members -->
                                                <div class="mb-4">
                                                    <label class="block text-xs font-bold text-gray-500 mb-2">باقي الأعضاء</label>
                                                    <div id="group-members-selection" class="max-h-32 overflow-y-auto border rounded-xl p-2 bg-gray-50 dark:bg-gray-700"></div>
                                                </div>

                                                <div class="flex gap-2">
                                                    <button onclick="closeModal('edit-group-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 font-medium">إلغاء</button>
                                                    <button onclick="saveGroupChanges()" class="flex-1 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-800">حفظ</button>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Transfer Student Modal -->
                                        <div id="transfer-modal" class="fixed inset-0 bg-black/60 z-[150] hidden flex items-center justify-center p-4">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                                                <div class="flex justify-between items-center mb-4">
                                                    <h3 class="font-bold text-lg">نقل ${getLabel('student')}</h3>
                                                    <button onclick="closeModal('transfer-modal')" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                                                </div>

                                                <input type="hidden" id="transfer-student-id">

                                                    <p id="transfer-student-name" class="text-center text-gray-600 dark:text-gray-300 mb-4 font-medium"></p>

                                                    <label class="block text-sm font-bold text-gray-500 mb-2">اختر المرحلة الجديدة:</label>
                                                    <select id="transfer-target-level" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-3 mb-4 text-lg">
                                                        <option value="">-- اختر المرحلة --</option>
                                                    </select>

                                                    <div class="flex gap-2">
                                                        <button onclick="closeModal('transfer-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium">إلغاء</button>
                                                        <button onclick="confirmTransferStudent()" class="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700">تأكيد النقل</button>
                                                    </div>
                                            </div>
                                        </div>

                                        <!-- Delete Competition Modal -->
                                        <div id="delete-competition-modal" class="fixed inset-0 bg-black/50 z-[10000] hidden flex items-start justify-center p-4 pt-10 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center">
                                                <div class="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                                                    <i data-lucide="alert-triangle" class="w-8 h-8"></i>
                                                </div>
                                                <h3 class="font-bold text-lg mb-2">حذف المسابقة؟</h3>
                                                <p class="text-gray-500 text-sm mb-6">سيتم حذف جميع المجموعات والدرجات المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.</p>
                                                <div class="flex gap-3">
                                                    <button onclick="closeModal('delete-competition-modal')" class="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">إلغاء</button>
                                                    <button id="confirm-delete-comp-btn" class="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 shadow-lg">حذف نهائي</button>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Reset Competition Modal -->
                                        <div id="reset-competition-modal" class="fixed inset-0 bg-black/50 z-[10000] hidden flex items-start justify-center p-4 pt-10 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center">
                                                <div class="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600 dark:text-orange-400">
                                                    <i data-lucide="refresh-ccw" class="w-8 h-8"></i>
                                                </div>
                                                <h3 class="font-bold text-lg mb-2">تصفير المسابقة؟</h3>
                                                <p class="text-gray-500 text-sm mb-6">سيتم حذف جميع الدرجات والغياب المسجل في هذه المسابقة فقط. ستبقى المجموعات والطلاب والمعايير كما هي.</p>
                                                <div class="flex gap-3">
                                                    <button onclick="closeModal('reset-competition-modal')" class="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">إلغاء</button>
                                                    <button id="confirm-reset-comp-btn" class="flex-1 py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 shadow-lg font-bold">تصفير الآن</button>
                                                </div>
                                            </div>
                                        </div>
                                        `;
}



function getGradingModalsHTML() {
    return `
                                        <div id="grading-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-0 shadow-2xl max-h-[80vh] flex flex-col">
                                                <!-- Header -->
                                                <div class="p-4 border-b flex justify-between shrink-0 items-center">
                                                    <h3 class="font-bold text-lg">رصد الدرجات</h3>
                                                    <button onclick="closeModal('grading-modal')" class="text-gray-500 hover:bg-gray-100 p-1 rounded-full"><i data-lucide="x"></i></button>
                                                </div>
                                                
                                                <!-- Body -->
                                                <div class="p-4 flex-1 overflow-y-auto">
                                                    <!-- Date Picker Section -->
                                                    <div class="mb-4 bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                                                        <div class="flex items-center gap-3">
                                                            <div class="bg-white dark:bg-gray-600 p-2 rounded-lg shadow-sm border">📅</div>
                                                            <div class="flex-1">
                                                                <p class="text-xs text-gray-500 mb-1">تاريخ الرصد</p>
                                                                <input type="date" id="grading-date" class="w-full bg-transparent font-bold text-gray-700 dark:text-gray-200 outline-none">
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <!-- List Container -->
                                                    <div id="grading-students-list" class="space-y-3"></div>
                                                </div>
                                            </div>
                                        </div>



                                        <!-- Activity Day Modals -->
                                        <div id="activity-check-modal" class="fixed inset-0 bg-black/60 z-[120] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[85vh]">
                                                <h3 class="font-bold text-lg mb-2">تسجيل يوم نشاط 🏃</h3>
                                                <p class="text-xs text-gray-500 mb-4">حدد الطلاب الغائبين ليتم استثناؤهم من النقاط:</p>
                                                <div id="activity-students-list" class="flex-1 overflow-y-auto mb-4 border rounded-xl divide-y dark:divide-gray-700"></div>
                                                <div class="flex gap-2">
                                                    <button onclick="closeModal('activity-check-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium">إلغاء</button>
                                                    <button onclick="submitActivityDay()" class="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 shadow-lg">تأكيد الرصد</button>
                                                </div>
                                            </div>
                                        </div>

                                        <div id="activity-absent-modal" class="fixed inset-0 bg-black/60 z-[130] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
                                                <div class="text-center mb-6">
                                                    <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                                        <i data-lucide="check-circle" class="w-8 h-8"></i>
                                                    </div>
                                                    <h3 class="font-bold text-lg">تم رصد يوم النشاط!</h3>
                                                    <p class="text-sm text-gray-500">${state.currentLevel === 'ijazat' ? 'تم تسجيل الغياب، يمكنك مراسلة الدارسين مباشرة:' : 'تم تسجيل الغياب، يمكنك مراسلة أولياء الأمور:'}</p>
                                                </div>
                                                <div id="activity-absent-whatsapp-list" class="space-y-3 mb-6"></div>
                                                <button onclick="closeModal('activity-absent-modal')" class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 rounded-xl font-bold">إغلاق</button>
                                            </div>
                                        </div>

                                        <!-- Reset Student Scores Modal -->
                                        <div id="reset-student-scores-modal" class="fixed inset-0 bg-black/60 z-[10000] hidden flex items-start justify-center p-4 pt-10 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col text-center">
                                                <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <i data-lucide="alert-triangle" class="w-8 h-8"></i>
                                                </div>
                                                <h3 class="font-bold text-lg mb-2 text-red-600">تأكيد تصفير الدرجات</h3>
                                                <p class="text-gray-500 text-sm mb-6">هل أنت متأكد من حذف جميع درجات وغيابات هذا الطالب في هذه المسابقة؟ لا يمكن التراجع عن هذا الإجراء.</p>
                                                <div class="flex gap-3">
                                                    <button onclick="closeModal('reset-student-scores-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-bold transition">إلغاء</button>
                                                    <button onclick="confirmResetStudentScores()" class="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition shadow-lg">نعم، تصفير</button>
                                                </div>
                                            </div>
                                        </div>

                                        <div id="delete-modal-v2" style="z-index: 99999 !important;" class="fixed inset-0 bg-black/70 hidden flex items-start justify-center p-4 pt-20 backdrop-blur-md">
                                             <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xs p-6 shadow-[0_0_50px_rgba(0,0,0,0.3)] text-center border-2 border-red-500/20">
                                                <div class="bg-red-100 dark:bg-red-900/30 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                                                    <i data-lucide="alert-triangle" class="w-10 h-10"></i>
                                                </div>
                                                <h3 class="font-bold text-xl mb-2">تأكيد الحذف النهائي</h3>
                                                <p class="text-gray-500 text-sm mb-6 font-medium">هذا الإجراء سيقوم بحذف البيانات نهائياً ولا يمكن التراجع عنه.</p>
                                                <div class="flex flex-col gap-3">
                                                    <button id="confirm-delete-btn-v2" class="w-full py-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-lg shadow-red-200 dark:shadow-none transition-all active:scale-95">تأكيد الحذف</button>
                                                    <button onclick="closeModal('delete-modal-v2')" class="w-full py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 font-bold transition-all">تراجع</button>
                                                </div>
                                             </div>
                                        </div>
                                        `;
}

// --- Password Modal Logic ---
let passwordResolver = null;

function requestPassword(message) {
    return new Promise((resolve) => {
        $('#password-modal-msg').textContent = message || "يرجى إدخال كلمة المرور للمتابعة";
        $('#modal-password-input').value = "";
        passwordResolver = resolve;
        toggleModal('password-modal', true);
        setTimeout(() => $('#modal-password-input').focus(), 100);
    });
}

function submitPasswordModal() {
    const val = $('#modal-password-input').value;
    if (passwordResolver) passwordResolver(val);
    toggleModal('password-modal', false);
}

function resolvePasswordModal(val) {
    if (passwordResolver) passwordResolver(val);
    toggleModal('password-modal', false);
}

// --- Data Operations (Refs to modals) ---

// === STUDENTS ===
function openAddStudentModal() {
    $('#student-id').value = '';
    $('#student-form').reset();
    $('#student-modal-title').textContent = 'إضافة طالب جديد';
    $('#save-student-text').textContent = 'حفظ';
    if(document.getElementById('student-national-id')) document.getElementById('student-national-id').value = '';
    if(document.getElementById('student-last-exam')) document.getElementById('student-last-exam').value = '';
    if(document.getElementById('student-last-exam')) document.getElementById('student-last-exam').value = '';
    
    const ts = $('#transfer-student-section');
    if (ts) ts.classList.add('hidden');
    
    toggleModal('student-modal', true);
}

function openTransferModal() {
    closeModal('student-modal'); // Close edit modal
    
    // Create prompt options for levels
    let levelsHtml = '';
    for (const [key, value] of Object.entries(LEVELS)) {
        if (key !== state.currentLevel && !value.hidden) {
            levelsHtml += `<option value="${key}">${value.name}</option>`;
        }
    }

    const studentId = $('#student-id').value;
    const studentName = $('#student-name').value;

    const modalHtml = `
        <div id="transfer-modal" class="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <div class="flex items-center gap-3 mb-4 text-blue-600 dark:text-blue-400">
                    <i data-lucide="arrow-right-left" class="w-6 h-6"></i>
                    <h3 class="text-lg font-bold">طلب نقل ال${getLabel('student')}: ${studentName}</h3>
                </div>

                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-bold mb-1">إلى أي حلقة تريد نقل الطالب؟</label>
                        <select id="transfer-to-level" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3">
                            <option value="">-- اختر الحلقة --</option>
                            ${levelsHtml}
                        </select>
                    </div>
                    
                    <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
                        <label class="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" id="transfer-delete-data" class="mt-1 w-4 h-4 text-red-600">
                            <div>
                                <span class="block text-sm font-bold text-red-800 dark:text-red-300">مسح بيانات ال${getLabel('student')} في حلقتي</span>
                                <span class="block text-xs text-red-600 dark:text-red-400 mt-1">${state.currentLevel === 'ijazat' ? 'إذا قمت بتحديد هذا الخيار، سيتم حذف جميع درجات ومراجعات الدارس المسجلة باسم حلقتك (بشكل نهائي) بمجرد قبول المعلم الآخر للطلب.' : 'إذا قمت بتحديد هذا الخيار، سيتم حذف جميع درجات ومراجعات الطالب المسجلة باسم حلقتك (بشكل نهائي) بمجرد قبول المعلم الآخر للطلب.'} إذا تركته فارغاً سيتم الاحتفاظ بدرجاته كأرشيف لحلقتك.</span>
                            </div>
                        </label>
                    </div>

                </div>

                <div class="flex gap-3 mt-6">
                    <button type="button" onclick="document.getElementById('transfer-modal').remove()" class="flex-1 py-3 rounded-xl text-gray-600 hover:bg-gray-100 font-bold transition">إلغاء</button>
                    <button type="button" onclick="submitTransferRequest('${studentId}', '${state.currentLevel}')" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2">
                        <i data-lucide="send" class="w-4 h-4"></i>
                        إرسال الطلب
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

async function submitTransferRequest(studentId, fromLevel) {
    const toLevel = document.getElementById('transfer-to-level').value;
    const deleteOldData = document.getElementById('transfer-delete-data').checked;

    if (!toLevel) {
        showToast("الرجاء اختيار الحلقة المستهدفة", "error");
        return;
    }

    try {
        const qSafe = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "transfer_requests"),
            window.firebaseOps.where("studentId", "==", studentId),
            window.firebaseOps.where("status", "==", "pending")
        );
        const snap = await window.firebaseOps.getDocs(qSafe);
        
        if (!snap.empty) {
            showToast("يوجد طلب نقل قيد الانتظار لهذا الطالب بالفعل!", "error");
            document.getElementById('transfer-modal').remove();
            return;
        }

        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "transfer_requests"), {
            studentId: studentId,
            fromLevel: fromLevel,
            toLevel: toLevel,
            deleteOldData: deleteOldData,
            status: 'pending',
            updatedAt: new Date().toISOString()
        });

        document.getElementById('transfer-modal').remove();
        showToast(`تم إرسال طلب النقل لمعلم الحلقة المحددة. ال${getLabel('student')} سيبقى في قائمتك حتى يتم القبول.`, "success");

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء إرسال الطلب", "error");
    }
}




async function openEditStudent(id) {
    const student = state.students.find(s => s.id === id);
    if (!student) return;

    // إذا كان طالباً، يجب التحقق من كلمة المرور أولاً
    if (!state.isTeacher) {
        const msg = student.password ? 'أدخل كلمة المرور الخاصة بك:' : 'أدخل كلمة مرور المرحلة لتعديل بياناتك:';
        const enteredPass = await requestPassword(msg);
        if (!enteredPass) return;

        let isValid = false;
        if (student.password) {
            // Check personal password (already loaded client-side)
            if (enteredPass === student.password) isValid = true;
        } else {
            // No personal password — verify against level password via server
            try {
                isValid = await window.firebaseOps.rpc('verify_password', {
                    p_level: state.currentLevel,
                    p_role: 'student',
                    p_password: enteredPass
                });
            } catch(e) { isValid = false; }
        }

        if (!isValid) {
            showToast('كلمة المرور غير صحيحة', 'error');
            return;
        }
    }

    $('#student-id').value = student.id;
    $('#student-name').value = student.name;
    $('#student-number').value = student.studentNumber || '';
    if(document.getElementById('student-national-id')) document.getElementById('student-national-id').value = student.nationalId || '';
    if(document.getElementById('student-last-exam')) document.getElementById('student-last-exam').value = student.lastAssociationExam || '';
    $('#student-emoji').value = student.icon || '👤';
    $('#student-password-edit').value = student.password || '';

    // إعداد حالة القراءة فقط للطالب
    const isTeacher = state.isTeacher;
    $('#student-number').disabled = !isTeacher;
    if(document.getElementById('student-national-id')) document.getElementById('student-national-id').disabled = !isTeacher;
    if(document.getElementById('student-last-exam')) document.getElementById('student-last-exam').disabled = !isTeacher;
    $('#student-password-edit').disabled = !isTeacher;

    // الاسم والصورة مسموح بتعديلهم

    // عرض الصورة/الإيموجي الحالي
    const preview = $('#student-emoji-preview');
    if (isImgSrc(student.icon)) {
        preview.innerHTML = `<img src="${student.icon}" class="w-full h-full object-cover">`;
    } else {
        preview.innerHTML = student.icon || '👤';
    }

    $('#student-modal-title').textContent = getLabel('edit_student');

    $('#save-student-text').textContent = 'تحديث';

    const ts = $('#transfer-student-section');
    if (ts) {
        if (state.isTeacher) {
            ts.classList.remove('hidden');
        } else {
            ts.classList.add('hidden');
        }
    }

    toggleModal('student-modal', true);
}

let studentToDeleteId = null;
function confirmDeleteStudent(id) {
    studentToDeleteId = id;
    toggleModal('delete-modal-v2', true);
    // Bind verify
    const confirmBtn = document.getElementById('confirm-delete-btn-v2');
    if (confirmBtn) confirmBtn.onclick = performDeleteStudent;
}

async function performDeleteStudent() {
    if (!studentToDeleteId) return;
    try {
        // Get student name for audit log
        const student = state.students.find(s => s.id === studentToDeleteId);
        const studentName = student ? student.name : 'unknown';

        // --- Cascade: delete student_plans + plan_daily_records ---
        const plansQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, 'student_plans'),
            window.firebaseOps.where('student_id', '==', studentToDeleteId)
        );
        const plansSnap = await window.firebaseOps.getDocs(plansQ);
        for (const planDoc of plansSnap.docs) {
            // Delete all daily records for this plan
            const recQ = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, 'plan_daily_records'),
                window.firebaseOps.where('plan_id', '==', planDoc.id)
            );
            const recSnap = await window.firebaseOps.getDocs(recQ);
            for (const r of recSnap.docs) {
                await window.firebaseOps.deleteDoc(
                    window.firebaseOps.doc(window.db, 'plan_daily_records', r.id));
            }
            await window.firebaseOps.deleteDoc(
                window.firebaseOps.doc(window.db, 'student_plans', planDoc.id));
        }
        // ----------------------------------------------------------
        
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "students", studentToDeleteId));
        showToast("تم الحذف");
        closeModal('delete-modal-v2');
        
        // Audit log — critical operation
        logAuditEvent('delete_student', 'student', studentToDeleteId, { studentName });
    } catch (err) { console.error(err); showToast("خطأ في الحذف", "error"); }
}

// === GROUPS ===

let currentManageCompId = null;

function openManageGroups(compId, compName) {
    currentManageCompId = compId;
    $('#groups-comp-name').textContent = compName;

    // إظهار زر إضافة مجموعة للمعلم فقط
    const addBtn = $('#add-group-btn');
    if (addBtn) {
        if (state.isTeacher) {
            addBtn.classList.remove('hidden');
        } else {
            addBtn.classList.add('hidden');
        }
    }

    toggleModal('groups-modal', true);
    fetchGroupsForCompetition(compId);
}

function fetchGroupsForCompetition(compId) {
    const container = $('#groups-container');
    container.innerHTML = '<div class="text-center p-4"><i data-lucide="loader-2" class="animate-spin w-6 h-6 mx-auto"></i></div>';

    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "groups"),
        window.firebaseOps.where("competitionId", "==", compId)
    );

    // Realtime listener for groups modal? Or just getDocs? 
    // getDocs is safer for modal to avoid lingering listeners.
    window.firebaseOps.getDocs(q).then(snap => {
        if (snap.empty) {
            container.innerHTML = '<p class="text-center text-gray-400">لا توجد مجموعات</p>';
            return;
        }
        state.groups = [];
        const html = [];
        snap.forEach(doc => {
            var g = doc.data();
            g.id = doc.id;
            state.groups.push(g);
            const isImg = isImgSrc(g.icon);
            const iconHtml = isImg
                ? `<img src="${g.icon}" class="w-full h-full object-cover">`
                : (g.icon || '🛡️');

            html.push(`
                                            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl border shadow-sm overflow-hidden">
                                                <div onclick="viewGroupStudents('${g.id}')" class="flex items-center gap-3 p-3 cursor-pointer hover:bg-white dark:hover:bg-gray-700 transition">
                                                    <div class="w-10 h-10 bg-white dark:bg-gray-600 rounded-lg flex items-center justify-center text-xl border overflow-hidden shadow-sm">
                                                        ${iconHtml}
                                                    </div>
                                                    <div class="flex-1">
                                                        <h4 class="font-bold text-gray-800 dark:text-gray-100">${g.name}</h4>
                                                        <div class="flex gap-2 text-xs text-gray-500">
                                                            <span>${(g.members ? g.members.length : 0)} أعضاء</span>
                                                            ${g.leader ? '<span class="text-amber-500 font-bold">👑</span>' : ''}
                                                        </div>
                                                    </div>
                                                    <i data-lucide="chevron-left" class="w-4 h-4 text-gray-400"></i>
                                                </div>
                                                ${state.isTeacher ? `
                    <div class="border-t flex divide-x dark:divide-gray-600">
                        <button onclick="event.stopPropagation(); openEditGroup('${g.id}')" class="flex-1 text-emerald-700 dark:text-emerald-400 font-bold text-sm py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition">
                            <i data-lucide="edit-2" class="w-3 h-3 inline"></i> تعديل
                        </button>
                        <button onclick="event.stopPropagation(); deleteGroup('${g.id}')" class="flex-1 text-red-600 dark:text-red-400 font-bold text-sm py-2 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                            <i data-lucide="trash-2" class="w-3 h-3 inline"></i> حذف
                        </button>
                    </div>
                    ` : ''}
                                            </div>
                                            `);
        });
        container.innerHTML = html.join('');
        lucide.createIcons();
    });
}

async function viewGroupStudents(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) {
        showToast("المجموعة غير موجودة", "error");
        return;
    }

    const container = $('#groups-container');
    container.innerHTML = '<div class="text-center p-4"><i data-lucide="loader-2" class="animate-spin w-6 h-6 mx-auto"></i></div>';
    lucide.createIcons();

    const memberIds = group.members || [];
    const groupStudents = state.students.filter(s => memberIds.includes(s.id));

    // Fetch scores for this group's students in this competition
    let studentScores = {};
    try {
        const scoresQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("competitionId", "==", currentManageCompId)
        );
        const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
        scoresSnap.forEach(doc => {
            const s = doc.data();
            if (memberIds.includes(s.studentId)) {
                studentScores[s.studentId] = (studentScores[s.studentId] || 0) + (s.points || 0);
            }
        });
    } catch (e) { console.error("Error fetching scores:", e); }

    let html = `
                                            <div class="mb-4 flex justify-between items-center">
                                                <div>
                                                    <button onclick="fetchGroupsForCompetition('${currentManageCompId}')" class="text-emerald-700 font-bold text-sm flex items-center gap-1">
                                                        <i data-lucide="arrow-right" class="w-4 h-4"></i>
                                                        العودة للمجموعات
                                                    </button>
                                                    <h4 class="font-bold text-lg mt-2">${group.name}</h4>
                                                </div>
                                            </div>
                                            <div class="space-y-2">
                                                `;

    if (groupStudents.length === 0) {
        html += `<p class="text-center text-gray-400 py-4">لا يوجد ${getLabel('students')} في هذه المجموعة</p>`;
    } else {
        groupStudents.forEach(s => {
            const isImg = s.icon && s.icon.startsWith('data:image');
            const iconHtml = isImg ? `<img src="${s.icon}" class="w-full h-full object-cover rounded-full">` : (s.icon || '👤');
            const score = studentScores[s.id] || 0;
            const isLeader = group.leader === s.id;
            const isDeputy = group.deputy === s.id;

            html += `
                <div class="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-xl border shadow-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border">
                            ${iconHtml}
                        </div>
                        <div>
                            <h4 class="font-bold text-sm flex items-center gap-1">
                                ${s.name}
                                ${isLeader ? '<span class="text-amber-500">👑</span>' : ''}
                                ${isDeputy ? '<span class="text-emerald-500">⭐</span>' : ''}
                            </h4>
                            <p class="text-xs text-gray-500">${s.studentNumber || ''}</p>
                        </div>
                    </div>
                    <div class="text-center">
                        <span class="text-lg font-bold ${score >= 0 ? 'text-green-600' : 'text-red-600'}">${score}</span>
                        <p class="text-xs text-gray-400">نقطة</p>
                    </div>
                </div>
            `;
        });
    }

    // Group total
    const groupTotal = Object.values(studentScores).reduce((a, b) => a + b, 0);
    html += `
                                            </div>
                                            </div>
                                            <div class="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-between">
                                                <div>
                                                    <span class="text-sm text-emerald-800 dark:text-emerald-300 block">مجموع نقاط المجموعة:</span>
                                                    <span class="text-2xl font-bold text-emerald-700 dark:text-emerald-400">${groupTotal}</span>
                                                </div>
                                                ${state.isTeacher ? `
                                                <button onclick="generateGroupWeeklyReport('${group.id}')" class="bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-emerald-800 transition flex items-center gap-2">
                                                    <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
                                                    تقرير الأسبوع
                                                </button>
                                                ` : ''}
                                            </div>
                                            `;

    container.innerHTML = html;
    lucide.createIcons();
}

async function generateGroupWeeklyReport(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    const comp = state.competitions.find(c => c.id === currentManageCompId);
    if (!comp) return; // Should not happen if inside viewGroup

    showToast("جاري إعداد التقرير...", "info");

    try {
        // 1. Calculate Date Range (based on active days)
        const dateStrings = generateReportDatesForPreviousPeriod();
        if (!dateStrings || dateStrings.length === 0) {
            showToast("لا توجد أيام مفعلة في الجدول", "error");
            return;
        }

        // 2. Fetch Scores for all members
        const memberIds = group.members || [];
        if (memberIds.length === 0) {
            showToast("المجموعة فارغة", "error");
            return;
        }

        const scoresQuery = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            // We can't use 'in' for both studentId (array) and date (array) usually.
            // Better to fetch all scores for this competition/date and filter by memberIds client-side
            window.firebaseOps.where("date", "in", dateStrings)
        );

        const snap = await window.firebaseOps.getDocs(scoresQuery);
        const scores = [];
        snap.forEach(d => {
            const data = d.data();
            if (memberIds.includes(data.studentId)) {
                scores.push(data);
            }
        });

        // NEW: Fetch Activity Days Log
        const activityQuery = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "activity_days"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "in", dateStrings)
        );
        const activitySnap = await window.firebaseOps.getDocs(activityQuery);
        const activityLog = {}; // date -> points
        activitySnap.forEach(d => {
            const data = d.data();
            activityLog[data.date] = data.points;
        });

        // 3. Calculate Stats
        let totalPositiveEarned = 0;
        let totalAbsenceDeduction = 0;
        let absenceCount = 0;
        let activityDaysTaken = 0;

        scores.forEach(s => {
            const p = parseFloat(s.points) || 0;
            if (s.criteriaId === 'ABSENCE_RECORD') {
                totalAbsenceDeduction += p; // p is negative
                absenceCount++;
            } else {
                if (p > 0) totalPositiveEarned += p;
                else totalAbsenceDeduction += p; // Negative criteria also deducted
            }
        });

        // Calculate Possible Points (Original)
        let dailyStandardPossible = 0;
        if (comp.criteria) {
            comp.criteria.forEach(c => {
                dailyStandardPossible += (parseFloat(c.positivePoints) || 0);
            });
        }

        let totalPossible = 0;
        dateStrings.forEach(dateStr => {
            if (activityLog[dateStr]) {
                // This was an Activity Day
                totalPossible += activityLog[dateStr] * memberIds.length;
                activityDaysTaken++;
            } else {
                // Normal Day
                totalPossible += dailyStandardPossible * memberIds.length;
            }
        });

        const netTotal = totalPositiveEarned + totalAbsenceDeduction;

        // 4. Construct Message
        let reportText = `📊 *تقرير الفترة السابقة (مجموعة ${group.name})* 📊\n`;
        reportText += `📅 الفترة: ${dateStrings[0] || ''} إلى ${dateStrings[dateStrings.length - 1] || ''}\n`;
        reportText += `👥 عدد ${getLabel('students')}: ${memberIds.length}\n`;
        if (activityDaysTaken > 0) {
            reportText += `🎪 تم إقامة نشاط في هذه الفترة\n`;
        }
        reportText += `------------------\n`;

        reportText += `🎯 النقاط المستحقة (الأصلية): ${totalPossible}\n`;
        reportText += `✅ النقاط المكتسبة: ${totalPositiveEarned}\n`;

        if (absenceCount > 0) {
            reportText += `⚠️ الغياب: ${absenceCount} حالة (${totalAbsenceDeduction} نقطة)\n`;
        }

        // If we had bonus logic: reportText += `➕ نقاط إضافية: ${addedPoints}\n`;

        reportText += `------------------\n`;
        reportText += `✨ *المجموع الصافي: ${netTotal}* ✨\n`;

        reportText += `\nشاكرين جهودكم 🌹`;

        // 5. Open WhatsApp (Generic)
        const url = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
        window.open(url, '_blank');

    } catch (e) {
        console.error(e);
        showToast("خطأ في إنشاء التقرير", "error");
    }
}

function addNewGroup() {
    if (!currentManageCompId) {
        showToast("يجب اختيار مسابقة أولاً", "error");
        return;
    }
    openAddGroupModal();
}

// فتح نافذة إضافة مجموعة جديدة
function openAddGroupModal() {
    if (!currentManageCompId) {
        showToast("يجب اختيار مسابقة أولاً", "error");
        return;
    }

    // إعادة تعيين النموذج
    $('#edit-group-id').value = '';
    $('#edit-group-name').value = '';
    $('#group-icon').value = '🛡️';
    $('#group-icon-preview').innerHTML = '🛡️';
    $('#group-modal-title').textContent = 'إضافة مجموعة جديدة';

    // تعبئة قوائم الطلاب
    populateGroupStudentLists();
    renderGroupMembersSelect([], null, null);

    toggleModal('edit-group-modal', true);
    lucide.createIcons();
}

// تعبئة قوائم اختيار الطلاب (القائد والنائب)
function populateGroupStudentLists() {
    const leaderSelect = $('#group-leader');
    const deputySelect = $('#group-deputy');

    if (!leaderSelect || !deputySelect) return;

    const options = '<option value="">-- اختر --</option>' +
        state.students.map(s => `<option value="${s.id}" > ${s.name}</option>`).join('');

    leaderSelect.innerHTML = options;
    deputySelect.innerHTML = options;
}

function openEditGroup(groupId) {
    if (!state.isTeacher) {
        showToast("عذراً، هذا الإجراء متاح للمعلم فقط", "error");
        return;
    }

    if (!groupId) {
        openAddGroupModal();
        return;
    }

    $('#edit-group-id').value = groupId;
    $('#group-modal-title').textContent = 'تعديل المجموعة';

    // تعبئة قوائم الطلاب
    populateGroupStudentLists();

    // جلب بيانات المجموعة
    window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "groups", groupId)).then(snap => {
        if (snap.exists()) {
            const d = snap.data();
            $('#edit-group-name').value = d.name || '';
            $('#group-leader').value = d.leader || '';
            $('#group-deputy').value = d.deputy || '';
            $('#group-icon').value = d.icon || '🛡️';

            // عرض الأيقونة
            const preview = $('#group-icon-preview');
            if (isImgSrc(d.icon)) {
                preview.innerHTML = `<img src = "${d.icon}" class="w-full h-full object-cover">`;
            } else {
                preview.innerHTML = d.icon || '🛡️';
            }

            renderGroupMembersSelect(d.members || [], d.leader, d.deputy);
        }
    }).catch(err => {
        console.error(err);
        showToast("خطأ في تحميل بيانات المجموعة", "error");
    });

    toggleModal('edit-group-modal', true);
    lucide.createIcons();
}

async function previewGroupImage(input) {
    if (input.files && input.files[0]) {
        const compressed = await compressImage(input.files[0]);
        const preview = document.getElementById('group-icon-preview');
        preview.innerHTML = `<img src="${compressed}" class="w-full h-full object-cover">`;
        document.getElementById('group-icon').value = compressed;
    }
}

// دورة الإيموجي للمجموعات
const groupEmojis = ["🛡️", "⚔️", "🏆", "🌟", "🦁", "🐯", "🦅", "🐎", "🔥", "💎", "👑", "⭐", "🚀", "💪", "🎯"];
let groupEmojiIndex = 0;

function cycleGroupEmoji() {
    groupEmojiIndex = (groupEmojiIndex + 1) % groupEmojis.length;
    const emoji = groupEmojis[groupEmojiIndex];
    document.getElementById('group-icon').value = emoji;
    document.getElementById('group-icon-preview').innerHTML = emoji;
}

function renderGroupMembersSelect(selectedIds, leaderId, deputyId) {
    const list = $('#group-members-selection');
    if (!list) return;

    if (state.students.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-400 text-sm py-2">لا يوجد ${getLabel('students')}</p>`;
        return;
    }

    list.innerHTML = state.students.map(s => {
        const isSelected = selectedIds.includes(s.id);
        const isLeaderOrDeputy = s.id === leaderId || s.id === deputyId;
        return `
                                                <label class="flex items-center gap-2 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer ${isLeaderOrDeputy ? 'opacity-50' : ''}" >
                                                    <input type="checkbox" value="${s.id}" class="group-member-checkbox w-4 h-4 text-emerald-700 rounded" ${isSelected ? 'checked' : ''} ${isLeaderOrDeputy ? 'disabled' : ''}>
                                                        <span class="text-sm">${s.name}</span>
                                                        ${isLeaderOrDeputy ? '<span class="text-xs text-gray-400">(قائد/نائب)</span>' : ''}
                                                </label>
                                                `;
    }).join('');
}

async function saveGroupChanges() {
    const id = $('#edit-group-id').value;
    const name = $('#edit-group-name').value;
    const leader = $('#group-leader').value;
    const deputy = $('#group-deputy').value;
    const icon = $('#group-icon').value;
    const members = Array.from($$('.group-member-checkbox:checked')).map(cb => cb.value);

    // إضافة القائد والنائب للأعضاء إذا لم يكونوا موجودين
    if (leader && !members.includes(leader)) members.push(leader);
    if (deputy && !members.includes(deputy)) members.push(deputy);

    if (!name) { showToast("اسم المجموعة مطلوب", "error"); return; }
    if (!leader && !deputy) { showToast("يرجى تحديد قائد أو نائب للمجموعة على الأقل", "warning"); return; }

    // Check if any student is already in another group for this competition
    try {
        const groupsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "groups"),
            window.firebaseOps.where("competitionId", "==", currentManageCompId)
        );
        const groupsSnap = await window.firebaseOps.getDocs(groupsQ);

        const existingMembers = new Set();
        groupsSnap.forEach(doc => {
            if (doc.id !== id) { // Ignore current group if editing
                const gData = doc.data();
                if (gData.members && Array.isArray(gData.members)) {
                    gData.members.forEach(m => existingMembers.add(m));
                }
            }
        });

        const duplicates = members.filter(m => existingMembers.has(m));
        if (duplicates.length > 0) {
            const dupNames = state.students.filter(s => duplicates.includes(s.id)).map(s => s.name).join(', ');
            showToast(`${getLabel('students')} مسجلون في مجموعات أخرى: ${dupNames}`, "error");
            return;
        }

    } catch (e) {
        console.error("Error checking group duplicates", e);
        showToast("خطأ في التحقق من الأعضاء", "error");
        return;
    }

    const data = {
        name,
        icon,
        leader,
        deputy,
        competitionId: currentManageCompId,
        members,
        level: state.currentLevel,
        updatedAt: new Date()
    };

    try {
        if (id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "groups", id), data);
            showToast("تم تحديث المجموعة");
        } else {
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "groups"), data);
            showToast("تم إضافة المجموعة");
        }
        closeModal('edit-group-modal');
        fetchGroupsForCompetition(currentManageCompId);
    } catch (err) {
        console.error(err);
        showToast("خطأ في حفظ المجموعة", "error");
    }
}

// === GRADING SYSTEM ===
let currentGradingCompId = null;
let currentGradingGroupId = null;
let currentRateStudentId = null;

function openGradingSession(compId, keepDate = false) {
    if (!state.isTeacher) {
        showToast("عذراً، الرصد متاح للمعلم فقط", "error");
        return;
    }

    currentGradingCompId = compId;
    currentGradingGroupId = null;

    // Set default date to today and MAX to today ONLY if not set
    const dateInput = $('#grading-date');
    const today = new Date().toISOString().split('T')[0];
    if (dateInput) {
        if (!keepDate) {
            // Reset to today ONLY on fresh open, not on refresh
            dateInput.value = today;
        }
        dateInput.max = today;
    }

    // Fetch groups for this competition
    const container = $('#grading-students-list');
    container.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>';

    toggleModal('grading-modal', true);
    lucide.createIcons();

    // Fetch groups
    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "groups"),
        window.firebaseOps.where("competitionId", "==", compId)
    );

    window.firebaseOps.getDocs(q).then(snap => {
        if (snap.empty) {
            container.innerHTML = '<p class="text-center text-gray-400 py-8">لا توجد مجموعات. أضف مجموعات أولاً من قائمة المسابقات.</p>';
            return;
        }
        let html = `
        <div class="mb-4 space-y-2">
            <button onclick="openActivityCheckModal('ALL')" class="w-full bg-purple-600 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg hover:bg-purple-700 transition flex items-center justify-center gap-2">
                <i data-lucide="zap" class="w-5 h-5"></i>
                يوم نشاط
            </button>
            <div class="flex gap-2">
                <button onclick="openCollectiveNoteModal()" class="flex-1 bg-purple-50 text-purple-700 px-4 py-3 rounded-xl text-sm font-bold shadow-sm hover:bg-purple-100 transition flex items-center justify-center gap-2 border border-purple-200">
                    <i data-lucide="message-square" class="w-5 h-5"></i>
                    ملاحظة جماعية
                </button>
                <button onclick="openCollectiveGradingModal()" class="flex-1 bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-100 transition flex items-center justify-center gap-2 border border-emerald-200">
                    <i data-lucide="users" class="w-5 h-5"></i>
                    رصد جماعي
                </button>
            </div>
        </div>
        <div class="space-y-3">`;
        snap.forEach(doc => {
            var g = doc.data();
            g.id = doc.id;
            const iconHtml = isImgSrc(g.icon)
                ? `<img src="${g.icon}" class="w-full h-full object-cover">`
                : (g.icon || '🛡️');

            html += `
            <div onclick="openGroupGrading('${g.id}')" class="flex items-center gap-3 p-3 bg-white dark:bg-gray-700/50 rounded-xl border shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition">
                <div class="w-10 h-10 bg-gray-100 dark:bg-gray-600 rounded-lg flex items-center justify-center text-xl border overflow-hidden shadow-sm">
                    ${iconHtml}
                </div>
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800 dark:text-gray-100">${g.name}</h4>
                    <p class="text-xs text-gray-500">${(g.members ? g.members.length : 0)} أعضاء</p>
                </div>
                <i data-lucide="chevron-left" class="w-4 h-4 text-gray-400"></i>
            </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
        lucide.createIcons();
    });
}

function openGroupGrading(groupId) {
    currentGradingGroupId = groupId;

    const container = $('#grading-students-list');
    container.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>';
    lucide.createIcons();

    // Fetch group data
    window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "groups", groupId)).then(async snap => {
        if (!snap.exists()) {
            container.innerHTML = '<p class="text-center text-red-400">المجموعة غير موجودة</p>';
            return;
        }

        const group = snap.data();
        const memberIds = group.members || [];

        if (memberIds.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <button onclick="openGradingSession('${currentGradingCompId}')" class="text-emerald-700 font-bold text-sm mb-4">← العودة للمجموعات</button>
                    <p class="text-gray-400">لا يوجد ${getLabel('students')} في هذه المجموعة</p>
                </div>`;
            return;
        }

        // Fetch students from Firebase directly (fix for empty state.students)
        let groupStudents = state.students.filter(s => memberIds.includes(s.id));

        // If state.students is empty, fetch from Firebase
        if (groupStudents.length === 0 && memberIds.length > 0) {
            try {
                const studentsSnap = await window.firebaseOps.getDocs(
                    window.firebaseOps.query(
                        window.firebaseOps.collection(window.db, "students"),
                        window.firebaseOps.where("level", "==", state.currentLevel)
                    )
                );
                const fetchedStudents = [];
                studentsSnap.forEach(function (doc) {
                    var data = doc.data();
                    data.id = doc.id;
                    fetchedStudents.push(data);
                });
                state.students = fetchedStudents; // Update state for future use
                groupStudents = fetchedStudents.filter(s => memberIds.includes(s.id));
            } catch (e) {
                console.error("Error fetching students:", e);
            }
        }

        if (groupStudents.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <button onclick="openGradingSession('${currentGradingCompId}')" class="text-emerald-700 font-bold text-sm mb-4">← العودة للمجموعات</button>
                    <p class="text-gray-400">لا يوجد طلاب في هذه المجموعة</p>
                </div>`;
            return;
        }

        let html = `
            <div class="sticky top-0 bg-white dark:bg-gray-800 py-2 mb-3 border-b flex justify-between items-center">
                <div>
                    <button onclick="openGradingSession('${currentGradingCompId}')" class="text-emerald-700 font-bold text-sm flex items-center gap-1">
                        <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        العودة
                    </button>
                    <h4 class="font-bold mt-1">${group.name}</h4>
                </div>
                <button onclick="openGroupPointsModal()" class="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-amber-200 transition flex items-center gap-1 border border-amber-300">
                    <i data-lucide="sparkles" class="w-3 h-3"></i>
                    نقاط للمجموعة
                </button>
            </div>
            <div class="space-y-2">
        `;

        groupStudents.forEach(s => {
            const isImg = s.icon && s.icon.startsWith('data:image');
            const iconHtml = isImg ? `<img src="${s.icon}" class="w-full h-full object-cover rounded-full">` : (s.icon || '👤');

            html += `
                <div onclick="openRateStudent('${s.id}')" class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl cursor-pointer hover:bg-gray-100 transition">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center border overflow-hidden">${iconHtml}</div>
                        <div>
                            <h4 class="font-bold text-sm">${s.name}</h4>
                            <p class="text-xs text-gray-500">${s.studentNumber || ''}</p>
                        </div>
                    </div>
                    <i data-lucide="chevron-left" class="text-gray-400"></i>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
        lucide.createIcons();
    });
}

function refreshGradingStatus() {
    if (currentGradingGroupId) {
        openGroupGrading(currentGradingGroupId);
    } else {
        openGradingSession(currentGradingCompId, true); // Keep Date!
    }
}

function filterGradingList(val) {
    // For simplicity, re-render with filter (could be optimized)
    refreshGradingStatus();
}

function openRateStudent(studentId) {
    ensureRateStudentModal();
    currentRateStudentId = studentId;
    const s = state.students.find(x => x.id === studentId);
    $('#rate-student-name').textContent = s ? s.name : `تقييم ${getLabel('student')}`;
    if(document.getElementById('rate-note-text')) document.getElementById('rate-note-text').value = '';
    
    // Set date
    const mainDate = $('#grading-date') ? $('#grading-date').value : new Date().toISOString().split('T')[0];
    if (document.getElementById('modal-grading-date')) {
        document.getElementById('modal-grading-date').value = mainDate;
    }

    // Handle Ijazat Note visibility
    const visSelect = document.getElementById('rate-note-visibility');
    if (visSelect) {
        if (state.currentLevel === 'ijazat') {
            visSelect.value = 'student'; // Always to student
            visSelect.classList.add('hidden'); // Hide it completely
        } else {
            visSelect.classList.remove('hidden');
        }
    }

    // Show and initialize quran section
    const quranSec = document.getElementById('rate-quran-section');
    if (quranSec) {
        quranSec.classList.remove('hidden');
        const startSuraMemorization = document.getElementById('rate-quran-start-sura-memorization');
        if (startSuraMemorization && startSuraMemorization.options.length <= 1) {
            const suras = window.QuranService.getSuras();
            const optionsHtml = suras.map(s => `<option value="${s.number}">${s.name}</option>`).join('');
            
            ['memorization', 'review'].forEach(type => {
                const sSura = document.getElementById(`rate-quran-start-sura-${type}`);
                const eSura = document.getElementById(`rate-quran-end-sura-${type}`);
                if(sSura) sSura.innerHTML = `<option value="">السورة..</option>` + optionsHtml;
                if(eSura) eSura.innerHTML = `<option value="">السورة..</option>` + optionsHtml;
            });
        }
        
        // Reset selections
        ['memorization', 'review'].forEach(type => {
            const startS = document.getElementById(`rate-quran-start-sura-${type}`);
            const endS = document.getElementById(`rate-quran-end-sura-${type}`);
            if(startS) startS.value = "";
            if(endS) endS.value = "";
            const startA = document.getElementById(`rate-quran-start-aya-${type}`);
            if(startA) { startA.innerHTML = '<option value="">الآية..</option>'; startA.disabled = true; }
            const endA = document.getElementById(`rate-quran-end-aya-${type}`);
            if(endA) { endA.innerHTML = '<option value="">الآية..</option>'; endA.disabled = true; }
            const gradeEl = document.getElementById(`rate-quran-grade-${type}`);
            if(gradeEl) gradeEl.value = "";
        });
    }

    // عرض التاريخ
    const dateVal = $('#grading-date').value;
    const dateDisplay = document.getElementById('rate-date-display');
    if (dateDisplay) {
        dateDisplay.textContent = `تاريخ الرصد: ${dateVal}`;
    }

    // Get Competition Criteria
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    if (!comp || !comp.criteria) {
        showToast("لا توجد معايير لهذه المسابقة", "error");
        return;
    }

    const grid = $('#criteria-buttons-grid');
    grid.innerHTML = comp.criteria.map(c => {
        const hasPos = parseFloat(c.positivePoints) > 0;
        const hasNeg = parseFloat(c.negativePoints) > 0;
        const isMult = !!c.isMultiplier;

        return `
            <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3 mb-2">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm">${c.name}</span>
                    <span class="text-[9px] text-gray-400 font-bold uppercase tracking-wider">${isMult ? 'تكرار متعدد' : 'ثابت'}</span>
                </div>
                
                <div class="flex items-center gap-2">
                    ${hasPos ? `
                        <button onclick="submitScoreWithMultiplier('${c.id}', ${c.positivePoints}, '${c.name}', 'positive', ${isMult})" 
                                class="flex-1 bg-emerald-50 text-emerald-700 border border-emerald-100 py-3 rounded-xl font-bold hover:bg-emerald-100 transition flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>+${c.positivePoints}</span>
                        </button>
                    ` : ''}
                    
                    ${hasNeg ? `
                        <button onclick="submitScoreWithMultiplier('${c.id}', ${c.negativePoints}, '${c.name}', 'negative', ${isMult})" 
                                class="flex-1 bg-rose-50 text-rose-700 border border-rose-100 py-3 rounded-xl font-bold hover:bg-rose-100 transition flex items-center justify-center gap-2">
                            <i data-lucide="minus" class="w-4 h-4"></i>
                            <span>-${c.negativePoints}</span>
                        </button>
                    ` : ''}
                </div>

                ${isMult ? `
                    <div class="flex items-center gap-2 bg-white dark:bg-gray-700 p-2 rounded-xl border border-gray-200 dark:border-gray-600">
                        <span class="text-xs text-gray-500 font-bold px-2">العدد:</span>
                        <input type="number" id="mult-qty-${c.id}" value="1" min="1" step="1" 
                               class="w-full bg-transparent text-center font-extrabold text-emerald-900 dark:text-emerald-400 focus:outline-none text-sm">
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // زر الغياب الإضافي + زر التقرير الأسبوعي + زر نقاط مخصصة
    grid.innerHTML += `
        <div class="col-span-1 mt-4 grid grid-cols-2 gap-3 w-full">
            <button onclick="openAbsenceOptions()" class="bg-orange-50 text-orange-700 border border-orange-200 py-3 rounded-xl font-bold hover:bg-orange-100 transition flex items-center justify-center gap-2">
                <i data-lucide="user-x" class="w-4 h-4"></i>
                <span>تسجيل غياب</span>
            </button>
             <button onclick="generateWeeklyReport()" class="bg-emerald-50 text-emerald-700 border border-emerald-200 py-3 rounded-xl font-bold hover:bg-emerald-100 transition flex items-center justify-center gap-2">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                <span>تقرير أسبوعي</span>
            </button>
        </div>
        <div class="col-span-1 mt-1 w-full flex gap-2">
            <button onclick="openCustomPointsModal()" class="flex-1 py-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold transition flex items-center justify-center gap-2 border border-emerald-300 dark:border-emerald-800 shadow-sm">
                <i data-lucide="sparkles" class="w-5 h-5"></i>
                نقاط مخصصة
            </button>
            <button onclick="openResetStudentScoresModal()" class="flex-1 py-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-xl font-bold transition flex items-center justify-center gap-2 border border-red-200 dark:border-red-800 shadow-sm">
                <i data-lucide="trash-2" class="w-5 h-5"></i>
                تصفير درجاته
            </button>
        </div>
    `;

    toggleModal('rate-student-modal', true);
    lucide.createIcons();

    // Load plan tracking if student has active plan for today
    const _planTrackDate = document.getElementById('modal-grading-date')?.value || new Date().toLocaleDateString('en-CA');
    if (typeof loadPlanTrackingForStudent === 'function') {
        loadPlanTrackingForStudent(studentId, _planTrackDate);
    }
}

window.setQuranType = (type) => {
    document.getElementById('rate-quran-type').value = type;
    const btnHifz = document.getElementById('btn-type-hifz');
    const btnMuraja = document.getElementById('btn-type-muraja');
    
    if (type === 'memorization') {
        btnHifz.className = "py-2 rounded-lg text-xs font-bold border-2 border-emerald-400 bg-emerald-100 text-emerald-700";
        btnMuraja.className = "py-2 rounded-lg text-xs font-bold border-2 border-gray-200 bg-white text-gray-500";
    } else {
        btnMuraja.className = "py-2 rounded-lg text-xs font-bold border-2 border-emerald-400 bg-emerald-100 text-emerald-700";
        btnHifz.className = "py-2 rounded-lg text-xs font-bold border-2 border-gray-200 bg-white text-gray-500";
    }
};

async function submitScoreWithMultiplier(criteriaId, basePoints, criteriaName, type, isMult) {
    let multiplier = 1;
    if (isMult) {
        const qtyEl = document.getElementById(`mult-qty-${criteriaId}`);
        multiplier = parseInt(qtyEl ? qtyEl.value : 1) || 1;
    }
    
    const finalPoints = parseFloat(basePoints) * multiplier;
    const finalLabel = isMult ? `${criteriaName} (${multiplier} م)` : criteriaName;
    
    await submitScore(criteriaId, type === 'negative' ? -Math.abs(finalPoints) : Math.abs(finalPoints), finalLabel, type);
}
window.updateQuranAyas = (rangeType, type) => {
    const suraNo = document.getElementById(`rate-quran-${rangeType}-sura-${type}`).value;
    const ayaSelect = document.getElementById(`rate-quran-${rangeType}-aya-${type}`);
    
    if (!suraNo) {
        ayaSelect.innerHTML = '<option value="">الآية..</option>';
        ayaSelect.disabled = true;
        return;
    }
    
    // جلب الآيات مع تصفية الآية رقم 0 (البسملة) حتى لا تظهر أبداً
    const ayahs = window.QuranService.getAyahs(suraNo).filter(a => a.aya_no > 0);
    const optionsHtml = ayahs.map(a => `<option value="${a.aya_no}">${a.aya_no}</option>`).join('');
    ayaSelect.innerHTML = `<option value="">الآية..</option>` + optionsHtml;
    ayaSelect.disabled = false;

    if (rangeType === 'start') {
        const endSuraSelect = document.getElementById(`rate-quran-end-sura-${type}`);
        if (!endSuraSelect.value) {
            endSuraSelect.value = suraNo;
            window.updateQuranAyas('end', type);
        }
    }
};


async function submitScore(criteriaId, points, criteriaName, type) {
    if (!currentRateStudentId || !currentGradingCompId) return;

    // Get selected date
    const dateInput = document.getElementById('modal-grading-date');
    const dateVal = dateInput && dateInput.value ? dateInput.value : ($('#grading-date') ? $('#grading-date').value : '');
    if (!dateVal) {
        showToast("يرجى اختيار التاريخ", "error");
        return;
    }

    const data = {
        studentId: currentRateStudentId,
        competitionId: currentGradingCompId === 'DIRECT_GRADING' ? null : currentGradingCompId,
        groupId: currentGradingGroupId || null,
        criteriaId,
        criteriaName,
        points: parseFloat(points),
        type,
        level: state.currentLevel,
        date: dateVal,
        updatedAt: new Date(),
        timestamp: Date.now()
    };

    try {
        // Query by student+date
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("studentId", "==", currentRateStudentId),
            window.firebaseOps.where("date", "==", dateVal)
        );

        const snap = await window.firebaseOps.getDocs(q);
        // Find ALL records for this criteriaId (ignore type to allow replacement)
        const criteriaDocs = snap.docs.filter(d => d.data().criteriaId === criteriaId);

        if (criteriaDocs.length > 0) {
            // Update the FIRST record instead of creating duplicate
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "scores", criteriaDocs[0].id), data);
            
            // Safety: Delete any accidental duplicates for the same criteria on the same day
            if (criteriaDocs.length > 1) {
                for (let i = 1; i < criteriaDocs.length; i++) {
                    await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "scores", criteriaDocs[i].id));
                }
            }
            
            showToast(`تم تعديل الدرجة إلى ${points}`, "success");
        } else {
            // Create new record
            data.createdAt = new Date();
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), data);
            showToast(`تم رصد ${points > 0 ? '+' : ''}${points} نقطة`, points > 0 ? "success" : "error");
        }
    } catch (e) {
        console.error(e);
        showToast("خطأ في الرصد", "error");
    }
}

async function submitNote() {
    if (!currentRateStudentId || !currentGradingCompId) return;

    const dateInput = document.getElementById('modal-grading-date');
    const dateVal = dateInput && dateInput.value ? dateInput.value : ($('#grading-date') ? $('#grading-date').value : '');
    const noteText = $('#rate-note-text').value.trim();
    const visibility = $('#rate-note-visibility').value;

    if (!dateVal) {
        showToast("يرجى اختيار التاريخ", "error");
        return;
    }
    if (!noteText) {
        showToast("يرجى كتابة الملاحظة أولاً", "error");
        return;
    }

    let criteriaName = "ملاحظة المعلم";
    if(visibility === 'student') criteriaName += state.currentLevel === 'ijazat' ? " (مباشرة)" : " (للدارس فقط)";
    else if(visibility === 'parent') criteriaName += state.currentLevel === 'ijazat' ? " (للآخرين فقط)" : " (لولي الأمر فقط)";

    const data = {
        studentId: currentRateStudentId,
        competitionId: currentGradingCompId === 'DIRECT_GRADING' ? null : currentGradingCompId,
        groupId: currentGradingGroupId || null,
        criteriaId: 'TEACHER_NOTE',
        criteriaName: criteriaName,
        points: 0,
        type: 'neutral',
        noteText: noteText,
        visibility: visibility,
        level: state.currentLevel,
        date: dateVal,
        updatedAt: new Date().toISOString(),
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
    };

    try {
        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), data);
        showToast("تم إرسال الملاحظة بنجاح", "success");
        $('#rate-note-text').value = '';
    } catch (e) {
        console.error(e);
        showToast("خطأ في الإرسال", "error");
    }
}

function openResetStudentScoresModal() {
    if (!currentRateStudentId || !currentGradingCompId) return;
    toggleModal('reset-student-scores-modal', true);
}

async function confirmResetStudentScores() {
    if (!currentRateStudentId || !currentGradingCompId) return;
    showToast(`جاري تصفير درجات ${getLabel('student')}...`);
    
    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("studentId", "==", currentRateStudentId),
            window.firebaseOps.where("competitionId", "==", currentGradingCompId)
        );

        const snap = await window.firebaseOps.getDocs(q);
        const batch = window.firebaseOps.writeBatch(window.db);

        snap.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        showToast(`تم حذف درجات ${getLabel('student')} في هذه المسابقة بنجاح`, "success");
        closeModal('reset-student-scores-modal');
        closeModal('rate-student-modal');
        
        // Audit log — critical operation
        const student = state.students.find(s => s.id === currentRateStudentId);
        logAuditEvent('reset_scores', 'scores', currentRateStudentId, {
            studentName: student ? student.name : 'unknown',
            competitionId: currentGradingCompId,
            deletedCount: snap.size
        });
    } catch (e) {
        console.error("Error resetting student scores:", e);
        showToast("خطأ في حذف الدرجات", "error");
    }
}
window.submitQuranRecord = async (quranType) => {
    if (!currentRateStudentId || !currentGradingCompId) return;

    const dateInput = document.getElementById('modal-grading-date');
    const dateVal = dateInput && dateInput.value ? dateInput.value : ($('#grading-date') ? $('#grading-date').value : '');
    if (!dateVal) {
        showToast("يرجى اختيار التاريخ", "error");
        return;
    }

    const startSuraNo = document.getElementById(`rate-quran-start-sura-${quranType}`).value;
    const startAyaNo = document.getElementById(`rate-quran-start-aya-${quranType}`).value;
    const endSuraNo = document.getElementById(`rate-quran-end-sura-${quranType}`).value;
    const endAyaNo = document.getElementById(`rate-quran-end-aya-${quranType}`).value;
    const quranGrade = document.getElementById(`rate-quran-grade-${quranType}`).value;

    if (!startSuraNo || !startAyaNo || !endSuraNo || !endAyaNo) {
        showToast("يرجى تحديد السورة والآية بداية ونهاية", "error");
        return;
    }
    if (!quranGrade) {
        showToast("يرجى اختيار التقدير", "error");
        return;
    }

    const startNum = parseInt(startSuraNo);
    const endNum = parseInt(endSuraNo);
    const startAyahNum = parseInt(startAyaNo);
    const endAyahNum = parseInt(endAyaNo);

    if (endNum < startNum) {
        showToast("لا يمكن أن تكون سورة النهاية قبل سورة البداية", "error");
        return;
    }
    if (endNum === startNum && endAyahNum < startAyahNum) {
        showToast("لا يمكن أن تكون آية النهاية قبل آية البداية في نفس السورة", "error");
        return;
    }

    const suras = window.QuranService.getSuras();
    const startSura = suras.find(s => s.number == startSuraNo);
    const endSura = suras.find(s => s.number == endSuraNo);

    let sectionParts = [];
    if (startSuraNo === endSuraNo) {
        sectionParts.push(`سورة ${ startSura ? startSura.name : startSuraNo } من آية ${startAyaNo} إلى آية ${endAyaNo}`);
    } else {
        // حساب آخر آية في سورة البداية من ملف البيانات
        const allStartAyahs = window.QuranService.getAyahs(startSuraNo).filter(a => a.aya_no > 0);
        const lastAyaInStart = allStartAyahs.length > 0 ? Math.max(...allStartAyahs.map(a => a.aya_no)) : "نهاية السورة";
        
        sectionParts.push(`سورة ${ startSura ? startSura.name : startSuraNo } من آية ${startAyaNo} إلى آية ${lastAyaInStart}`);
        
        // السور التي تقع في المنتصف
        const startNum = parseInt(startSuraNo);
        const endNum = parseInt(endSuraNo);
        for (let i = startNum + 1; i < endNum; i++) {
            const mid = suras.find(s => s.number == i);
            if (mid) sectionParts.push(`سورة ${mid.name} كاملة`);
        }
        
        // سورة النهاية (تكون دائماً من آية 1 إلى الآية المختارة)
        sectionParts.push(`سورة ${ endSura ? endSura.name : endSuraNo } من آية 1 إلى آية ${endAyaNo}`);
    }
    const quranSection = sectionParts.join(' | ');
    const criteriaId = quranType === 'memorization' ? 'QURAN_MEMORIZATION' : 'QURAN_REVIEW';
    const criteriaName = quranType === 'memorization' ? 'حفظ أو مراجعة صغرى' : 'مراجعة أو مراجعة كبرى';

    const data = {
        studentId: currentRateStudentId,
        competitionId: currentGradingCompId === 'DIRECT_GRADING' ? null : currentGradingCompId,
        groupId: currentGradingGroupId || null,
        criteriaId,
        criteriaName,
        points: 0,
        type: quranType,
        quranType,
        quranSection,
        quranGrade,
        quranStartSura: Number(startSuraNo),
        quranStartAya: Number(startAyaNo),
        quranEndSura: Number(endSuraNo),
        quranEndAya: Number(endAyaNo),
        level: state.currentLevel,
        date: dateVal,
        updatedAt: new Date(),
        timestamp: Date.now()
    };

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("studentId", "==", currentRateStudentId),
            window.firebaseOps.where("date", "==", dateVal),
            window.firebaseOps.where("criteriaId", "==", criteriaId)
        );
        const snap = await window.firebaseOps.getDocs(q);
        if (!snap.empty) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "scores", snap.docs[0].id), data);
            showToast(quranType === 'memorization' ? "تم تعديل الحفظ" : "تم تعديل المراجعة", "success");
        } else {
            data.createdAt = new Date();
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), data);
            showToast(quranType === 'memorization' ? "تم التسجيل بنجاح ✨" : "تم التسجيل بنجاح ✨", "success");
        }
    } catch (e) {
        console.error("Submission Error:", e);
        showToast("خطأ: " + (e.message || "فشل الاتصال بالخادم"), "error");
    }
};

// Student Edit Security Check
let currentActivityGroupId = null;

async function openActivityCheckModal(groupId) {
    currentActivityGroupId = groupId;
    
    let membersIds = [];
    if (groupId === 'ALL') {
        const compGroups = state.groups.filter(g => g.competitionId === currentGradingCompId);
        compGroups.forEach(g => {
            if(g.members) membersIds = membersIds.concat(g.members);
        });
    } else {
        const group = state.groups.find(g => g.id === groupId);
        if (!group) return;
        membersIds = group.members || [];
    }

    const list = $('#activity-students-list');
    list.innerHTML = `<div class="p-4 text-center"><i data-lucide="loader-2" class="animate-spin w-5 h-5 mx-auto"></i></div>`;
    lucide.createIcons();

    let members = state.students.filter(s => membersIds.includes(s.id));
    if (members.length === 0 && membersIds.length > 0) {
        const q = window.firebaseOps.query(window.firebaseOps.collection(window.db, "students"), window.firebaseOps.where("level", "==", state.currentLevel));
        const snap = await window.firebaseOps.getDocs(q);
        const all = []; snap.forEach(d => { var x = d.data(); x.id = d.id; all.push(x); });
        state.students = all;
        members = all.filter(s => membersIds.includes(s.id));
    }

    if (members.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-500 py-4">لا يوجد ${getLabel('students')} لتقييمهم</p>`;
    } else {
        list.innerHTML = members.map(s => `
            <label class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition">
                <span class="font-bold text-sm">${s.name}</span>
                <input type="checkbox" value="${s.id}" class="activity-absent-checkbox w-5 h-5 text-purple-600 rounded-lg border-gray-300">
            </label>
        `).join('');
    }

    toggleModal('activity-check-modal', true);
}

async function submitActivityDay() {
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    const dateVal = $('#grading-date').value;

    if (!comp || !dateVal) {
        showToast("خطأ في البيانات أو التاريخ", "error");
        return;
    }

    let membersIds = [];
    if (currentActivityGroupId === 'ALL') {
        const compGroups = state.groups.filter(g => g.competitionId === comp.id);
        compGroups.forEach(g => {
            if(g.members) membersIds = membersIds.concat(g.members);
        });
    } else {
        const group = state.groups.find(g => g.id === currentActivityGroupId);
        if (!group) return;
        membersIds = group.members || [];
    }

    const activityPoints = comp.activityPoints || 0;
    const rawActivityAbsentPoints = comp.activityAbsentPoints || 0;
    const activityAbsentPoints = rawActivityAbsentPoints > 0 ? -rawActivityAbsentPoints : rawActivityAbsentPoints;
    const absents = Array.from($$('.activity-absent-checkbox:checked')).map(cb => cb.value);

    const confirmBtn = $$('#activity-check-modal button')[1];
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4 mx-auto"></i>';
        lucide.createIcons();
    }

    try {
        // 0. Check if Activity Day already exists for this date and competition
        const duplicateCheckQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "activity_days"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "==", dateVal)
        );
        const duplicateCheckSnap = await window.firebaseOps.getDocs(duplicateCheckQ);
        if (!duplicateCheckSnap.empty) {
            showToast("تم تسجيل نشاط لهذا اليوم مسبقاً في هذه المسابقة", "error");
            return;
        }

        // 1. Log the Activity Day
        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "activity_days"), {
            competitionId: comp.id,
            date: dateVal,
            points: activityPoints
        });

        // 2. Save Scores using Sequential Batch for stability
        const batch = window.firebaseOps.writeBatch(window.db);

        membersIds.forEach(sid => {
            const isAbsent = absents.includes(sid);
            const groupId = currentActivityGroupId === 'ALL' ? (state.groups.find(g => g.members && g.members.includes(sid))?.id || '') : currentActivityGroupId;
            const scoreData = {
                studentId: sid,
                competitionId: comp.id,
                groupId: groupId,
                criteriaId: isAbsent ? 'ABSENCE_RECORD' : 'ACTIVITY_DAY',
                criteriaName: isAbsent ? 'غياب يوم نشاط' : 'حضور يوم نشاط',
                points: isAbsent ? activityAbsentPoints : activityPoints,
                type: isAbsent ? 'absence' : 'activity',
                level: state.currentLevel,
                date: dateVal,
                updatedAt: new Date(),
                timestamp: Date.now(),
                createdAt: new Date()
            };

            // Note: writeBatch.set in our wrapper always does addDoc
            batch.set(window.firebaseOps.doc(window.db, "scores", "temp_" + sid), scoreData);
        });

        await batch.commit();

        closeModal('activity-check-modal');
        showToast("تم رصد درجات النشاط بنجاح", "success");

        // 3. Show WhatsApp list for absentees
        const absentStudents = state.students.filter(s => absents.includes(s.id));
        if (absentStudents.length > 0) {
            const waList = $('#activity-absent-whatsapp-list');
            waList.innerHTML = absentStudents.map(s => {
                const phone = s.studentNumber || '';
                const msg = state.currentLevel === 'ijazat'
                    ? `السلام عليكم أخي ${s.name}،\nتم تسجيل غيابك عن يوم النشاط في ${comp.name}.`
                    : `نحيطكم علماً بغياب الطالب (${s.name}) عن يوم النشاط المقام اليوم في مسابقة ${comp.name}.`;
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

                return `
                    <div class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                        <span class="font-bold text-sm text-gray-800 dark:text-gray-200">${s.name}</span>
                        ${phone ? `
                        <a href="${url}" target="_blank" class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 hover:bg-green-700 transition">
                            <i data-lucide="message-circle" class="w-3 h-3"></i>
                            مراسلة
                        </a>
                        ` : '<span class="text-[10px] text-gray-400">لا يوجد رقم</span>'}
                    </div>
                `;
            }).join('');

            toggleModal('activity-absent-modal', true);
            lucide.createIcons();
        }

    } catch (e) {
        console.error("submitActivityDay error full:", e);
        const errorMsg = e.message || "حدث خطأ في الاتصال بقاعدة البيانات";
        showToast(errorMsg, "error");
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'تأكيد الرصد';
        }
    }
}


function toggleEmojiPicker(targetId) {
    // Simple prompt fallback
    const emojis = ["👤", "🏆", "🌟", "📚", "🕌", "⚽", "🧠", "⚔️", "🛡️", "🎒", "🎓"];
    const current = document.getElementById(targetId.replace('-btn', '')).value;

    // Create a temporary simple picker using native browser prompt is ugly. 
    // Let's cycle through them or show a mini modal. 
    // For now, let's just Randomize on click for fun/speed, or cycle.
    // Or better: prompt the user to paste an emoji? No.
    // Cycle:
    let idx = emojis.indexOf(current);
    if (idx === -1) idx = 0;
    const next = emojis[(idx + 1) % emojis.length];

    const inputId = targetId.replace('-btn', '');
    const previewId = targetId.replace('-btn', '-preview');

    document.getElementById(inputId).value = next;
    document.getElementById(previewId).textContent = next;
}


async function handleSaveStudent(e) {
    e.preventDefault();
    const btn = $('#save-student-btn');
    btn.disabled = true;

    const id = $('#student-id').value;
    const fileInput = document.getElementById('student-image-upload');
    let imageBase64 = $('#student-emoji').value; // Default or existing

    // Handle Image Upload
    if (fileInput && fileInput.files[0]) {
        imageBase64 = await compressImage(fileInput.files[0]);
    }

    let studentNumber = $('#student-number').value.trim();
    // Phone Format Logic (966) using normalizePhone
    studentNumber = normalizePhone(studentNumber);

    const data = {
        name: $('#student-name').value,
        studentNumber: studentNumber,
        nationalId: $('#student-national-id') ? $('#student-national-id').value.trim() : '',
        lastAssociationExam: $('#student-last-exam') ? $('#student-last-exam').value : '',
        parentPhone: studentNumber, // Same as studentNumber for parent lookup
        level: state.currentLevel,  // Level for parent to see
        icon: imageBase64, // Store Base64 Image
        password: $('#student-password-edit').value, // Student Password
        updatedAt: new Date()
    };

    // Duplicate Check for NEW students
    if (!id) {
        try {
            // Check by name
            const nameQ = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "students"),
                window.firebaseOps.where("name", "==", data.name.trim())
            );
            const nameSnap = await window.firebaseOps.getDocs(nameQ);
            
            let isDuplicate = !nameSnap.empty;

            // Check by national ID if > 5 digits
            if (!isDuplicate && data.nationalId && data.nationalId.trim().length > 5) {
                const idQ = window.firebaseOps.query(
                    window.firebaseOps.collection(window.db, "students"),
                    window.firebaseOps.where("nationalId", "==", data.nationalId.trim())
                );
                const idSnap = await window.firebaseOps.getDocs(idQ);
                isDuplicate = !idSnap.empty;
            }

            if (isDuplicate) {
                showToast("هذا الطالب مسجل مسبقا بالفعل", "error");
                btn.disabled = false;
                return;
            }
        } catch (e) {
            console.error("Duplicate check error:", e);
        }
    }

    // Mandatory Password for new students
    if (!id && !data.password) {
        // showToast("كلمة المرور مطلوبة للطالب الجديد", "error"); // Moved to inline
        const errEl = document.getElementById('password-error');
        if (errEl) errEl.classList.remove('hidden');
        btn.disabled = false;
        return;
    } else {
        const errEl = document.getElementById('password-error');
        if (errEl) errEl.classList.add('hidden');
    }

    try {
        if (id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "students", id), data);
            showToast("تم التحديث");
        } else {
            data.createdAt = new Date();
            data.level = state.currentLevel;
            const docRef = await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "students"), data);
            showToast("تم الإضافة");

            // Optimistic Update: Add to local state immediately
            data.id = docRef.id;
            // Convert createdAt to something sort-compatible (Timestamp-like) just for UI
            data.createdAt = new Date().toISOString();
            state.students.push(data);
            // Sort
            state.students.sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });
            updateStudentsListUI();
        }
        closeModal('student-modal');
    } catch (err) { console.error(err); showToast("خطأ", "error"); }
    finally { btn.disabled = false; }
}

function openAddCompetitionModal() {
    $('#competition-id').value = '';
    const titleEl = document.querySelector('#competition-modal h3');
    if (titleEl) titleEl.textContent = 'إضافة مسابقة جديدة';

    $('#competition-form').reset();
    $('#criteria-list').innerHTML = '';
    addCriteriaItem(); // Add one default
    toggleModal('competition-modal', true);
}

async function openEditCompetition(id) {
    if (!state.isTeacher) return;

    try {
        const docSnap = await window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "competitions", id));
        if (!docSnap.exists()) {
            showToast("المسابقة غير موجودة", "error");
            return;
        }
        const data = docSnap.data();

        $('#competition-id').value = id;
        $('#competition-name').value = data.name || '';
        $('#competition-emoji').value = data.icon || '🏆';
        $('#comp-absent-excuse').value = data.absentExcuse || 1;
        $('#comp-absent-no-excuse').value = data.absentNoExcuse || 4;
        $('#comp-activity-points').value = data.activityPoints || 0;
        $('#comp-activity-absent-points').value = data.activityAbsentPoints || 0;

        const titleEl = document.querySelector('#competition-modal h3');
        if (titleEl) titleEl.textContent = 'تعديل المسابقة';

        // Populate Criteria
        $('#criteria-list').innerHTML = '';
        if (data.criteria && Array.isArray(data.criteria) && data.criteria.length > 0) {
            data.criteria.forEach(c => addCriteriaItem(c.name, c.positivePoints, c.negativePoints, c.isMultiplier));
        } else {
            addCriteriaItem();
        }

        toggleModal('competition-modal', true);
        lucide.createIcons();
    } catch (e) {
        console.error(e);
        showToast("خطأ في جلب البيانات", "error");
    }
}

// Duplicates removed

// Emoji Picker & Other Modals



// --- Initialization ---

let isAppInitialized = false;

function init() {
    if (isAppInitialized) return;
    isAppInitialized = true;

    applyTheme();

    // Check for self-registration link
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('register') === '1') {
        const lvl = urlParams.get('level');
        if (lvl && LEVELS[lvl]) {
            window._selfRegistrationLevel = lvl;
            $('#loading').classList.add('hidden');
            $('#auth-overlay').classList.remove('hidden');
            
            // Hide other auth panels and the main card itself
            ['main-auth-card', 'auth-home', 'student-login-panel', 'teacher-login-panel', 'parent-login-panel'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            
            // Show register panel
            const regPanel = document.getElementById('student-register-panel');
            if (regPanel) {
                regPanel.classList.remove('hidden');
                
                // Update labels dynamically based on level
                const isAdult = lvl === 'ijazat';
                document.getElementById('self-reg-title').textContent = isAdult ? 'تسجيل دارس جديد 📝' : 'تسجيل طالب جديد 📝';
                document.getElementById('self-reg-name-label').textContent = 'ما اسمك؟ (الاسم الرباعي)';
                document.getElementById('self-reg-phone-label').textContent = isAdult ? 'رقم جوالك الشخصي' : 'رقم جوال ولي أمرك';
                document.getElementById('self-reg-id-label').textContent = isAdult ? 'رقم الهوية' : 'رقم الهوية / السجل المدني';
                document.getElementById('self-reg-password-label').textContent = 'اختر كلمة مرور شخصية لك';
            }
            return; // Stop normal init
        }
    }

    // Check Persistence
    if (loadAuth()) {
        // Already logged in
        $('#loading').classList.add('hidden');
        $('#app-content-wrapper').classList.remove('hidden'); // Show content
        $('#view-container').classList.remove('hidden'); // CRITICAL: Show view container
        updateUIMode();

        // Start Global Sync
        startGlobalDataSync();

        // Navigate based on role
        const startView = state.isParent ? 'parent' : (state.isTeacher ? 'home' : 'students');
        // Replace initial state so Android Back button exits app from start screen
        history.replaceState({ view: startView }, '', `#${startView}`);
        router.render(startView);

        // ✅ Auto-backup: check 3 seconds after teacher login
        if (state.isTeacher) {
            setTimeout(checkAndCreateWeeklyBackup, 3000);
        }
    } else {
        // Needs Login (Show Auth Overlay)
        $('#loading').classList.add('hidden');
        showAuthModal();
        history.replaceState({ view: 'auth' }, '', '#auth');
    }
}

function startGlobalDataSync() {
    if (!state.currentLevel) return;

    // 1. Competitions Sync
    if (competitionsUnsubscribe) competitionsUnsubscribe();
    const qComp = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "competitions"),
        window.firebaseOps.where("level", "==", state.currentLevel)
    );
    competitionsUnsubscribe = window.firebaseOps.onSnapshot(qComp, function (snapshot) {
        const comps = [];
        snapshot.forEach(function (doc) {
            var data = doc.data();
            data.id = doc.id;
            comps.push(data);
        });
        comps.sort(function (a, b) {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        state.competitions = comps;
        // If we are on competitions view, update UI
        if (state.currentView === 'competitions') updateCompetitionsListUI();
        // Leaderboard depends on active comp
        calculateLeaderboard();
    });

    // 2. Groups Sync
    if (activeGroupsUnsubscribe) activeGroupsUnsubscribe();
    const qGroups = window.firebaseOps.query(window.firebaseOps.collection(window.db, "groups"));
    activeGroupsUnsubscribe = window.firebaseOps.onSnapshot(qGroups, function (snap) {
        const allGroups = [];
        snap.forEach(function (d) {
            var data = d.data();
            data.id = d.id;
            allGroups.push(data);
        });
        state.groups = allGroups;
        calculateLeaderboard();
    });

    // 3. Level Settings Sync
    if (window.levelSettingsUnsubscribe) window.levelSettingsUnsubscribe();
    const qSettings = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "level_settings"),
        window.firebaseOps.where("level", "==", state.currentLevel)
    );
    window.levelSettingsUnsubscribe = window.firebaseOps.onSnapshot(qSettings, function(snap) {
        state.activeWeekDays = ['sun', 'mon', 'tue', 'wed', 'thu']; // default
        state.hideScoresFromStudent = false; // default
        state.enableDirectGrading = true; // default
        state.disableLeaderboard = false; // default
        snap.forEach(function(doc) {
            const data = doc.data();
            if (data.featureName === 'week_days' && data.settings && data.settings.activeDays) {
                state.activeWeekDays = [...data.settings.activeDays];
            } else if (data.activeDays && Array.isArray(data.activeDays)) {
                state.activeWeekDays = [...data.activeDays];
            }
            if (data.featureName === 'hide_scores' && data.isEnabled) {
                state.hideScoresFromStudent = true;
            }
            if (data.featureName === 'disable_leaderboard' && data.isEnabled) {
                state.disableLeaderboard = true;
            }
            if (data.featureName === 'direct_grading' && data.isEnabled === false) {
                state.enableDirectGrading = false;
            }
        });
        
        // Update Bottom Nav for Direct Grading
        const dgNav = document.getElementById('nav-direct-grading');
        if (dgNav) {
            dgNav.style.display = (state.isTeacher && state.enableDirectGrading) ? 'flex' : 'none';
        }
        // Show Plans nav for teachers
        const plansNav = document.getElementById('nav-plans');
        if (plansNav) {
            plansNav.style.display = state.isTeacher ? 'flex' : 'none';
        }
    });

    // 4. Transfer Requests Sync
    if (transferRequestsUnsubscribe) transferRequestsUnsubscribe();
    const qRequests = window.firebaseOps.query(window.firebaseOps.collection(window.db, "transfer_requests"));
    transferRequestsUnsubscribe = window.firebaseOps.onSnapshot(qRequests, function(snap) {
        const reqs = [];
        snap.forEach(function(d) {
            var data = d.data();
            data.id = d.id;
            // Only keep requests where this level is the sender or receiver
            if (data.fromLevel === state.currentLevel || data.toLevel === state.currentLevel) {
                reqs.push(data);
            }
        });
        state.transferRequests = reqs;
        if (state.currentView === 'students') updateTransferRequestsUI();
    });
}

// Utility to generate dates based on state.activeWeekDays
function generateReportDatesForPreviousPeriod() {
    const today = new Date();
    const result = [];
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    
    // Look back up to 14 days to find the previous active period
    let daysFound = 0;
    const targetDays = (state.activeWeekDays && state.activeWeekDays.length > 0) ? state.activeWeekDays.length : 5;
    const activeDaysList = state.activeWeekDays || ['sun', 'mon', 'tue', 'wed', 'thu'];
    
    // Start from yesterday
    for(let i = 1; i <= 21 && daysFound < targetDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dayStr = dayMap[d.getDay()];
        if (activeDaysList.includes(dayStr)) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            result.unshift(`${year}-${month}-${day}`); // Add to beginning to keep chronological order
            daysFound++;
        }
    }
    return result;
}

// Global History Listener for Android Back Button
window.addEventListener('popstate', (event) => {
    // 1. Close any open modals first (User Expectation: Back = Close Modal)
    const modals = document.querySelectorAll('[id$="-modal"]:not(.hidden)');
    if (modals.length > 0) {
        modals.forEach(m => {
            // Only remove dynamically created modals, hide static ones
            if (m.dataset.dynamic === 'true') {
                m.remove();
            } else {
                m.classList.add('hidden');
            }
        });
        // Push current state back to prevent further back navigation issues
        history.pushState({ view: state.currentView }, '', `#${state.currentView}`);
        return; // Don't navigate, just closed modal
    }

    // 2. Determine home view based on mode
    const homeView = state.isParent ? 'parent' : 'home';

    // 3. If already on home view, let Android handle it (exit app)
    if (state.currentView === homeView) {
        return; // Exit app
    }

    // 4. Otherwise, go back to home view
    history.replaceState({ view: homeView }, '', `#${homeView}`);
    router.render(homeView);
});


// === COMPETITION MANAGEMENT ===
function addCriteriaItem(name = '', pos = '', neg = '', isMultiplier = false) {
    const container = document.getElementById('criteria-list');
    if (!container) return; 
    
    const div = document.createElement('div');
    div.className = 'bg-gray-50 dark:bg-gray-700 p-3 rounded-xl mb-3 border border-gray-100 dark:border-gray-600';
    div.innerHTML = `
        <div class="grid grid-cols-[1fr_auto] gap-2 mb-2">
            <input type="text" placeholder="اسم المعيار" class="criteria-name w-full bg-white dark:bg-gray-600 border rounded-lg px-3 py-2 text-xs font-bold" value="${name}" required>
            <button type="button" onclick="this.closest('.bg-gray-50').remove()" class="text-rose-400 hover:text-rose-700 p-2"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <div class="flex flex-col">
                <span class="text-[9px] font-bold text-emerald-600 mb-1">زيادة (+)</span>
                <input type="number" step="0.25" placeholder="+" class="criteria-pos w-full bg-white dark:bg-gray-600 border rounded-lg px-2 py-1.5 text-xs text-center font-bold" value="${pos}" title="نقاط المكافأة">
            </div>
            <div class="flex flex-col">
                <span class="text-[9px] font-bold text-rose-700 mb-1">خصم (-)</span>
                <input type="number" step="0.25" placeholder="-" class="criteria-neg w-full bg-white dark:bg-gray-600 border rounded-lg px-2 py-1.5 text-xs text-center font-bold" value="${neg}" title="نقاط الخصم">
            </div>
            <div class="flex flex-col items-center justify-center pt-2">
                <span class="text-[9px] font-bold text-gray-500 mb-1">تكرار؟</span>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="criteria-is-multiplier sr-only peer" ${isMultiplier ? 'checked' : ''}>
                    <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
            </div>
        </div>
    `;
    container.appendChild(div);
    if (window.lucide) window.lucide.createIcons();
}

async function handleSaveCompetition(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('save-competition-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'جاري الحفظ...';
    }

    try {
        const id = document.getElementById('competition-id').value;
        const name = document.getElementById('competition-name').value;
        const icon = document.getElementById('competition-emoji').value;

        const absentExcuse = parseFloat(document.getElementById('comp-absent-excuse').value) || 1;
        const absentNoExcuse = parseFloat(document.getElementById('comp-absent-no-excuse').value) || 4;
        const activityPoints = parseFloat(document.getElementById('comp-activity-points').value) || 0;
        const activityAbsentPoints = parseFloat(document.getElementById('comp-activity-absent-points').value) || 0;

        // Collect Criteria
        const criteriaVals = [];
        document.querySelectorAll('#criteria-list > div').forEach(div => {
            criteriaVals.push({
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                name: div.querySelector('.criteria-name').value,
                positivePoints: parseFloat(div.querySelector('.criteria-pos').value) || 0,
                negativePoints: parseFloat(div.querySelector('.criteria-neg').value) || 0,
                isMultiplier: div.querySelector('.criteria-is-multiplier').checked
            });
        });

        if (criteriaVals.length === 0) {
            showToast("يجب إضافة معيار واحد على الأقل", "error");
            return; // Finally will run to reset button
        }

        const data = {
            name,
            icon,
            criteria: criteriaVals,
            absentExcuse,
            absentNoExcuse,
            activityPoints,
            activityAbsentPoints,
            level: state.currentLevel,
            updatedAt: new Date()
        };

        if (id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "competitions", id), data);
            showToast("تم تحديث المسابقة");
            // Audit log — criteria modification
            logAuditEvent('update_competition', 'competition', id, {
                competitionName: name,
                criteriaCount: criteriaVals.length,
                criteriaNames: criteriaVals.map(c => c.name)
            });
        } else {
            data.createdAt = new Date();
            const result = await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "competitions"), data);
            showToast("تم إنشاء المسابقة");
            // Audit log — new competition
            logAuditEvent('create_competition', 'competition', result.id, {
                competitionName: name,
                criteriaCount: criteriaVals.length
            });
        }
        closeModal('competition-modal');
    } catch (err) {
        console.error("Save Error:", err);
        showToast("خطأ في الاتصال أو الحفظ", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'حفظ المسابقة';
        }
    }
}

async function toggleCompetitionActive(id) {
    if (!state.isTeacher) return;
    try {
        // 1. Deactivate all others in this level
        const currentActive = state.competitions.find(c => c.active);
        if (currentActive && currentActive.id !== id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "competitions", currentActive.id), { active: false });
        }

        // 2. Toggle target (or set true if we enforce single active)
        // User wants "Select Active". If already active, maybe de-active? Or just keep.
        // Let's toggle.
        const target = state.competitions.find(c => c.id === id);
        const newState = !target.active;

        await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "competitions", id), { active: newState });
        showToast(newState ? "تم تفعيل المسابقة" : "تم إلغاء تفعيل المسابقة");
    } catch (e) {
        console.error(e);
        showToast("خطأ في تغيير الحالة", "error");
    }
}

// Initialization Trigger
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Safety timeout
        setTimeout(() => { if (!isAppInitialized) init(); }, 3000);

        if (window.firebaseOps) init();
        else window.addEventListener('firebaseReady', init, { once: true });
    });
} else {
    // Safety timeout
    setTimeout(() => { if (!isAppInitialized) init(); }, 3000);

    if (window.firebaseOps) init();
    else window.addEventListener('firebaseReady', init, { once: true });
}

// === ABSENCE & WHATSAPP LOGIC ===
function openAbsenceOptions() {
    // Get current competition settings
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    const absentExcuse = (comp && comp.absentExcuse) ? parseFloat(comp.absentExcuse) : 1;
    const absentNoExcuse = (comp && comp.absentNoExcuse) ? parseFloat(comp.absentNoExcuse) : 4;

    let modal = document.getElementById('absence-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'absence-modal';
        modal.className = 'fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        // Content will be set below
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div class="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600 dark:text-orange-400">
                <i data-lucide="user-x" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">تسجيل غياب</h3>
            <p class="text-gray-500 text-sm mb-6"> ${state.currentLevel === 'ijazat' ? 'هل تعذر الحضور اليوم بعذر أم بدون؟' : 'هل غاب الطالب بعذر أم بدون عذر؟'}</p>

            <div class="grid grid-cols-1 gap-3">
                <button onclick="confirmAbsence('excuse')" class="py-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 font-bold transition">
                    غائب بعذر (-${absentExcuse})
                </button>
                <button onclick="confirmAbsence('no-excuse')" class="py-3 rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-bold transition">
                    غائب بدون عذر (-${absentNoExcuse})
                </button>
                <button onclick="document.getElementById('absence-modal').remove()" class="py-2 text-gray-400 hover:text-gray-600 font-medium text-sm mt-2">إلغاء</button>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
}

async function confirmAbsence(type) {
    if (!type) return;

    // Get Competition Config
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    // Default values if not set
    const excusePoints = parseFloat((comp && comp.absentExcuse) ? comp.absentExcuse : 1);
    const noExcusePoints = parseFloat((comp && comp.absentNoExcuse) ? comp.absentNoExcuse : 4);

    const points = type === 'excuse' ? -excusePoints : -noExcusePoints;
    const label = type === 'excuse' ? 'غائب بعذر' : 'غائب بدون عذر';

    // Submit as a special score
    await submitScore('ABSENCE_RECORD', points, label, 'negative');

    var absenceModal = document.getElementById('absence-modal');
    if (absenceModal) absenceModal.remove();

    // Notify Parent via WhatsApp
    var student = state.students.find(function (s) { return s.id === currentRateStudentId; });
    if (student && student.studentNumber) {
        var phone = student.studentNumber;
        var msg = state.currentLevel === 'ijazat' 
            ? "السلام عليكم يا أخي " + student.name + "،\nتم تسجيل غياب لك اليوم (" + label + ").\nنرجو الحرص على الحضور والمتابعة."
            : "السلام عليكم ولي أمر الطالب " + student.name + "،\nتم تسجيل غياب للطالب اليوم (" + label + ").\nنرجو الحرص على الحضور.";

        var url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
        window.open(url, '_blank');
    }
}

async function generateWeeklyReport() {
    const student = state.students.find(s => s.id === currentRateStudentId);
    if (!student) return;

    if (!student.studentNumber) {
        showToast(state.currentLevel === 'ijazat' ? "لا يوجد رقم جوال للتواصل" : "لا يوجد رقم هاتف لولي الأمر", "error");
        return;
    }

    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    if (!comp) return;

    // 1. Calculate Date Range (based on active days)
    const dateStrings = generateReportDatesForPreviousPeriod();
    if (!dateStrings || dateStrings.length === 0) {
        showToast("لا توجد أيام مفعلة في الجدول", "error");
        return;
    }

    showToast("جاري إعداد التقرير...");

    try {
        // Query scores for student
        // We can't use 'in' query for dates easily if array large, but max 5.
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("studentId", "==", student.id),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "in", dateStrings)
        );

        const snap = await window.firebaseOps.getDocs(q);
        const scores = [];
        snap.forEach(d => scores.push(d.data()));

        // NEW: Fetch Activity Days Log
        const activityQuery = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "activity_days"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "in", dateStrings)
        );
        const activitySnap = await window.firebaseOps.getDocs(activityQuery);
        const activityLog = {}; // date -> points
        let activityDaysTaken = 0;
        let totalActivityPossible = 0;
        activitySnap.forEach(d => {
            const data = d.data();
            activityLog[data.date] = data.points;
            activityDaysTaken++;
            totalActivityPossible += (parseFloat(data.points) || 0);
        });

        // Calculate Totals per Criteria
        let reportText = `📊 *تقرير الفترة السابقة* 📊\n`;
        reportText += `👤 ال${getLabel('student')}: ${student.name}\n`;

        reportText += `📅 الفترة: ${dateStrings[0]} إلى ${dateStrings[dateStrings.length - 1]}\n`;
        if (activityDaysTaken > 0) {
            reportText += `🎪 تم إقامة نشاط (${activityDaysTaken} يوم)\n`;
        }
        reportText += `------------------\n`;

        let totalEarned = 0;
        let totalPossible = 0;

        const daysPassed = dateStrings.length;
        const normalDaysCount = daysPassed - activityDaysTaken;

        if (comp.criteria) {
            comp.criteria.forEach(c => {
                // Earned
                const cScores = scores.filter(s => s.criteriaId === c.id);
                const earned = cScores.reduce((sum, s) => sum + s.points, 0);

                // Possible: Criteria Points * Normal Days
                const possible = (parseFloat(c.positivePoints) || 0) * normalDaysCount;

                reportText += `🔹 ${c.name}: ${earned} / ${possible}\n`;

                totalEarned += earned;
                totalPossible += possible;
            });
        }

        // Add Activity Points if any
        if (activityDaysTaken > 0) {
            const activityScores = scores.filter(s => s.criteriaId === 'ACTIVITY_DAY');
            const activityEarned = activityScores.reduce((sum, s) => sum + s.points, 0);
        reportText += `🏃 نقاط النشاط: ${activityEarned} / ${totalActivityPossible}\n`;
            totalEarned += activityEarned;
            totalPossible += totalActivityPossible;
        }

        // Add Absence Deductions if any
        const absences = scores.filter(s => s.criteriaId === 'ABSENCE_RECORD');
        let absentDays = [];
        if (absences.length > 0) {
            const deduction = absences.reduce((sum, s) => sum + s.points, 0);
            reportText += `⚠️ خصم غياب: ${deduction}\n`;
            absences.forEach(ab => {
                absentDays.push(`${ab.date} (${ab.criteriaName || 'غياب'})`);
            });
            totalEarned += deduction;
        }

        if (absentDays.length > 0) {
            reportText += `❌ أيام الغياب:\n${absentDays.join('\n')}\n`;
        }

        // Add Teacher Notes if any
        const teacherNotes = scores.filter(s => s.criteriaId === 'TEACHER_NOTE' && s.noteText);
        if (teacherNotes.length > 0) {
            const visibleNotes = teacherNotes.filter(n => n.visibility !== 'student'); // Show 'both' or 'parent'
            if (visibleNotes.length > 0) {
                reportText += `\n💬 ملاحظات المعلم:\n`;
                visibleNotes.forEach(n => {
                    reportText += `- ${n.noteText}\n`;
                });
            }
        }

        // Add Custom Points (CUSTOM_*) if any
        const customScores = scores.filter(s => s.criteriaId && s.criteriaId.startsWith('CUSTOM_'));
        if (customScores.length > 0) {
            const customTotal = customScores.reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0);
            reportText += `⚡ نقاط مخصصة: ${customTotal}\n`;
            customScores.forEach(cs => {
                const sign = cs.points > 0 ? '+' : '';
                reportText += `  • ${cs.criteriaName || 'مخصص'}: ${sign}${cs.points}\n`;
            });
            totalEarned += customTotal;
        }

        // Add Quran Memorization/Review if any
        /*
        const quranScores = scores.filter(s => s.criteriaId === 'QURAN_MEMORIZATION' || s.criteriaId === 'QURAN_REVIEW');
        if (quranScores.length > 0) {
            const memScores = quranScores.filter(s => s.criteriaId === 'QURAN_MEMORIZATION');
            const revScores = quranScores.filter(s => s.criteriaId === 'QURAN_REVIEW');
            if (memScores.length > 0) {
                const memTotal = memScores.reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0);
                reportText += `📖 حفظ القرآن: ${memTotal}\n`;
                totalEarned += memTotal;
            }
            if (revScores.length > 0) {
                const revTotal = revScores.reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0);
                reportText += `📗 مراجعة القرآن: ${revTotal}\n`;
                totalEarned += revTotal;
            }
        }
        */

        reportText += `------------------\n`;
        reportText += `✨ *المجموع النهائي: ${totalEarned} / ${totalPossible}*\n`;
        reportText += `\n${state.currentLevel === 'ijazat' ? 'شاكرين جهودكم 🌹' : 'شاكرين تعاونكم 🌹'}`;

        // Send
        const url = `https://wa.me/${student.studentNumber}?text=${encodeURIComponent(reportText)}`;
        window.open(url, '_blank');

    } catch (e) {
        console.error(e);
        showToast("خطأ في إنشاء التقرير", "error");
    }
}

function getQuranSearchModalHTML() {
    return `
    <div id="quran-search-modal" class="fixed inset-0 bg-black/60 z-[100] hidden flex items-center justify-center p-4">
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div class="flex justify-between items-center mb-4 shrink-0">
                <h3 class="font-bold text-lg flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><i data-lucide="book" class="w-5 h-5"></i> بحث في المصحف</h3>
                <button onclick="closeModal('quran-search-modal')" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
            </div>
            
            <div class="flex gap-2 mb-4 shrink-0">
                <input type="text" id="quran-search-query" placeholder="ابحث بجزء من الآية (مسموح بدون تشكيل)..." class="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" onkeydown="if(event.key === 'Enter') executeQuranSearch()">
                <button onclick="executeQuranSearch()" class="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-emerald-700 transition flex items-center gap-2"><i data-lucide="search" class="w-5 h-5"></i></button>
            </div>
            
            <div id="quran-search-results" class="flex-1 overflow-y-auto space-y-3 p-1">
                <div class="text-center py-8 opacity-50">
                    <i data-lucide="search" class="w-12 h-12 mx-auto mb-3"></i>
                    <p class="text-sm">اكتب كلمة للبحث عنها، للوصول السريع لاسم السورة وأرقام الآيات.</p>
                </div>
            </div>
        </div>
    </div>
    `;
}

async function openQuranSearchModal() {
    // 1. Ensure modal exists in DOM
    if (!document.getElementById('quran-search-modal')) {
        const div = document.createElement('div');
        div.innerHTML = getQuranSearchModalHTML();
        document.body.appendChild(div.firstElementChild);
        lucide.createIcons();
    }

    toggleModal('quran-search-modal', true);
    
    if (typeof QuranService !== 'undefined' && !QuranService.isLoaded()) {
        const res = $('#quran-search-results');
        const oldHtml = res.innerHTML;
        res.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-emerald-600"></i><p class="text-xs text-gray-500 mt-2">جاري جلب بيانات المصحف...</p></div>';
        lucide.createIcons();
        await QuranService.loadData();
        res.innerHTML = oldHtml;
    }
    
    setTimeout(() => {
        const input = $('#quran-search-query');
        if(input) input.focus();
    }, 100);
}

function executeQuranSearch() {
    const query = $('#quran-search-query').value;
    const res = $('#quran-search-results');
    
    if (!query || query.trim() === '') {
        res.innerHTML = '<p class="text-center text-red-500 py-4 text-sm font-bold">الرجاء إدخال كلمة للبحث!</p>';
        return;
    }
    
    if (typeof QuranService === 'undefined' || !QuranService.isLoaded()) {
         showToast("خدمة المصحف غير متوفرة", "error");
         return;
    }
    
    // UI Loading state
    res.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-emerald-600"></i></div>';
    lucide.createIcons();
    
    setTimeout(() => {
        const results = QuranService.searchAyahs(query);
        if (results.length === 0) {
            res.innerHTML = '<p class="text-center text-gray-500 py-8 font-bold">لم يتم العثور على نتائج مطابقة.</p>';
            return;
        }
        
        const toShow = results.slice(0, 30);
        
        let html = `<p class="text-xs text-gray-500 mb-3 text-center border-b pb-2">تم العثور على <span class="font-bold text-emerald-600">${results.length}</span> آية ${results.length > 30 ? '(عرض أول 30)' : ''}</p>`;
        
        toShow.forEach(aya => {
            html += `
                <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm transition hover:border-emerald-400">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><i data-lucide="book-open" class="w-3 h-3"></i> سورة ${aya.sura_name_ar}</span>
                        <span class="text-[10px] text-gray-500 bg-white dark:bg-gray-600 px-2 py-0.5 rounded-full border">الجزء ${aya.jozz} | الآية ${aya.aya_no}</span>
                    </div>
                    <p class="font-quran text-gray-800 dark:text-gray-200 text-lg leading-loose text-justify" dir="rtl">${aya.aya_text} ﴿${Number(aya.aya_no).toLocaleString('ar-EG')}﴾</p>
                </div>
            `;
        });
        
        res.innerHTML = html;
        lucide.createIcons();
    }, 50); // slight delay to allow rendering spinner
}

// Global Modals Helper
function ensureGlobalModals() {
    if (!document.getElementById('student-modal')) {
        const modalsHTML = getStudentModalHTML() + getCompetitionModalsHTML() + getQuranSearchModalHTML();
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
        document.body.insertAdjacentHTML('beforeend', getGradingModalsHTML());
    }
}

// Delete Competition Function
let compToDeleteId = null;
async function deleteCompetition(id) {
    compToDeleteId = id;
    toggleModal('delete-competition-modal', true);
    document.getElementById('confirm-delete-comp-btn').onclick = performDeleteCompetition;
}

async function performDeleteCompetition() {
    if (!compToDeleteId) return;
    try {
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "competitions", compToDeleteId));
        showToast("تم حذف المسابقة");
        closeModal('delete-competition-modal');
    } catch (e) {
        console.error(e);
        showToast("خطأ في حذف المسابقة", "error");
    }
}

// === PARENT PORTAL ===

async function renderParentDashboard() {
    const container = $('#view-container');

    // If we need to reload students (e.g. after page refresh)
    if (state.parentStudents.length === 0 && state.parentPhone) {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("parentPhone", "==", state.parentPhone)
        );
        const snap = await window.firebaseOps.getDocs(q);
        state.parentStudents = [];
        snap.forEach(doc => {
            var dData = doc.data();
            dData.id = doc.id;
            state.parentStudents.push(dData);
        });
    }

    const students = state.parentStudents;

    container.innerHTML = `
        <div class="p-4 pb-24 max-w-lg mx-auto">
            <!-- Header -->
            <div class="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-6 mb-6 text-white shadow-lg">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl">👨‍👩‍👧‍👦</div>
                    <div>
                        <h1 class="text-xl font-bold">بوابة ولي الأمر</h1>
                        <p class="text-amber-100 text-sm">متابعة أداء أبنائك</p>
                    </div>
                </div>
            </div>

            <!-- Students Count -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border flex items-center justify-between">
                <div>
                    <p class="text-gray-500 text-sm">عدد الطلاب المسجلين</p>
                    <p class="text-2xl font-bold text-amber-600">${students.length}</p>
                </div>
                <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-xl flex items-center justify-center text-xl">📚</div>
            </div>

            <!-- Students List -->
            <h2 class="font-bold text-lg mb-3 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5 text-amber-600"></i> أبنائي</h2>
            <div class="space-y-3">
                ${students.length === 0 ? '<p class="text-center text-gray-400 py-8">لا يوجد طلاب مسجلين بهذا الرقم</p>' : ''}
                ${students.map(s => {
        const level = LEVELS[s.level] || { name: 'غير محدد', emoji: '📚' };
        const iconHtml = isImgSrc(s.icon)
            ? `<img src="${s.icon}" class="w-full h-full object-cover rounded-full">`
            : (s.icon || '👤');
        return `
                    <div onclick="openStudentReport('${s.id}')" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border hover:border-amber-400 cursor-pointer transition flex items-center gap-4">
                        <div class="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-2xl border-2 border-amber-200 overflow-hidden">
                            ${iconHtml}
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-800 dark:text-gray-100">${s.name}</h3>
                            <p class="text-xs text-gray-500">${level.emoji} ${level.name}</p>
                        </div>
                        <div class="text-amber-500">
                            <i data-lucide="chevron-left" class="w-5 h-5"></i>
                        </div>
                    </div>
                    `;
    }).join('')}
            </div>

            <!-- Action Buttons -->
            <div class="mt-8 space-y-3">
                <button onclick="logout()" class="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center justify-center gap-2">
                    <i data-lucide="log-out" class="w-4 h-4"></i>
                    تسجيل الخروج
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

async function openStudentReport(studentId) {
    const container = $('#view-container');
    container.innerHTML = '<div class="flex justify-center p-8"><i data-lucide="loader-2" class="animate-spin w-8 h-8 text-amber-600"></i></div>';
    lucide.createIcons();

    let student = null;
    if (state.isParent) {
        student = state.parentStudents.find(s => s.id === studentId);
    } else {
        student = window._currentStudentRecord || state.students.find(s => s.id === studentId);
        if(!student && window._tempLevelStudents) {
            student = window._tempLevelStudents.find(s => s.id === studentId);
        }
    }

    if (!student) {
        container.innerHTML = `<p class="text-center text-red-500 p-8">${getLabel('student')} غير موجود</p>`;
        return;
    }

    const level = LEVELS[student.level] || { name: 'غير محدد', emoji: '📚' };

    // Fetch student scores
    const scoresQuery = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "scores"),
        window.firebaseOps.where("studentId", "==", studentId)
    );
    const scoresSnap = await window.firebaseOps.getDocs(scoresQuery);
    const scores = [];
    scoresSnap.forEach(function (doc) {
        var data = doc.data();
        data.id = doc.id;
        scores.push(data);
    });

    // Calculate statistics
    let totalPoints = 0;
    let absenceDays = 0;
    let absenceWithExcuse = 0;
    let absenceNoExcuse = 0;
    const criteriaStats = {};
    const absenceRecordsWithExcuse = [];
    const absenceRecordsNoExcuse = [];

    scores.forEach(s => {
        totalPoints += (s.points || 0);

        if (s.criteriaId === 'ABSENCE_RECORD') {
            absenceDays++;
            if (s.criteriaName && s.criteriaName.indexOf('بعذر') !== -1) {
                absenceWithExcuse++;
                absenceRecordsWithExcuse.push({ date: s.date || 'غير محدد', points: s.points });
            } else {
                absenceNoExcuse++;
                absenceRecordsNoExcuse.push({ date: s.date || 'غير محدد', points: s.points });
            }
        } else {
            const key = s.criteriaName || 'أخرى';
            if (!criteriaStats[key]) criteriaStats[key] = { positive: 0, negative: 0, count: 0 };
            criteriaStats[key].count++;
            if (s.points > 0) criteriaStats[key].positive += s.points;
            else criteriaStats[key].negative += s.points;
        }
    });

    // Store absence records in window for modal access
    window._absenceRecordsWithExcuse = absenceRecordsWithExcuse.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    window._absenceRecordsNoExcuse = absenceRecordsNoExcuse.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Fetch student's group
    let groupName = 'غير محدد';
    const groupsQuery = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "groups"),
        window.firebaseOps.where("members", "array-contains", studentId)
    );
    const groupsSnap = await window.firebaseOps.getDocs(groupsQuery);
    if (!groupsSnap.empty) {
        groupName = groupsSnap.docs[0].data().name;
    }

    // Fetch ALL teachers for this level
    let teachers = [];
    const teachersQuery = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "teachers"),
        window.firebaseOps.where("level", "==", student.level)
    );
    const teachersSnap = await window.firebaseOps.getDocs(teachersQuery);
    teachersSnap.forEach(doc => {
        var data = doc.data();
        data.id = doc.id;
        teachers.push(data);
    });

    const iconHtml = isImgSrc(student.icon)
        ? `<img src="${student.icon}" class="w-full h-full object-cover rounded-full">`
        : (student.icon || '👤');



    // Save data globally for calendar interaction
    window._currentStudentData = student;
    window._currentStudentScores = scores;
    window._currentStudentPlannedDays = [];
    window._currentStudentPlanRecords = [];
    // Load plan records for calendar display
    try {
        const activePlansQ2 = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, 'student_plans'),
            window.firebaseOps.where('student_id', '==', studentId),
            window.firebaseOps.where('status', '==', 'active')
        );
        const activePlansSnap2 = await window.firebaseOps.getDocs(activePlansQ2);
        const activePlanMap2 = {};
        activePlansSnap2.forEach(doc => { activePlanMap2[doc.id] = { id: doc.id, ...doc.data() }; });
        for (const pid of Object.keys(activePlanMap2)) {
            const prQ = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, 'plan_daily_records'),
                window.firebaseOps.where('plan_id', '==', pid)
            );
            const prSnap = await window.firebaseOps.getDocs(prQ);
            prSnap.forEach(doc => {
                const d = doc.data(); d.id = doc.id;
                d.planType = activePlanMap2[pid]?.plan_type || 'memorization';
                window._currentStudentPlanRecords.push(d);
                window._currentStudentPlannedDays.push({ date: d.date, planType: d.planType, record: d, status: d.status || 'pending' });
            });
        }
    } catch(e) { console.warn('calendar plan load:', e); }
    
    const todayDate = new Date();
    window._currentCalendarYear = todayDate.getFullYear();
    window._currentCalendarMonth = todayDate.getMonth();
    
    // Will be generated dynamically via renderStudentCalendar
    const calendarHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border" id="student-calendar-container">
            <div class="text-center py-4 text-gray-500 text-sm">جاري تحميل التقويم...</div>
        </div>
    `;

    // Generate contact button HTML based on teachers count
    let contactHTML = '';
    if (teachers.length === 0) {
        contactHTML = `
            <div class="bg-gray-100 dark:bg-gray-700 rounded-xl p-4 text-center text-gray-500 text-sm">
                <i data-lucide="info" class="w-5 h-5 mx-auto mb-2"></i>
                لم يتم تسجيل بيانات المعلم بعد
            </div>
        `;
    } else if (teachers.length === 1) {
        contactHTML = `
            <button onclick="contactTeacher('${student.name}', '${teachers[0].phone}')" class="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-3">
                <i data-lucide="message-circle" class="w-5 h-5"></i>
                تواصل مع المعلم (${teachers[0].name || 'المعلم'})
            </button>
        `;
    } else {
        // Multiple teachers - store in window for modal access
        window._teachersForContact = teachers;
        window._currentStudentName = student.name;
        contactHTML = `
            <button onclick="openTeacherSelectionModal()" class="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-3">
                <i data-lucide="message-circle" class="w-5 h-5"></i>
                تواصل مع المعلم (${teachers.length} معلمين)
            </button>
        `;
    }

    const isStudent = (!state.isParent && !state.isTeacher);
    const _hideAgg = (state.hideScoresFromStudent && isStudent);

    let topButtonsHTML = '';
    if (state.isParent) {
        topButtonsHTML = `
            <button onclick="renderParentDashboard()" class="flex items-center gap-2 text-gray-500 hover:text-amber-600 mb-4 font-bold">
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
                العودة لقائمة الأبناء
            </button>
        `;
    } else if (state.isTeacher) {
        topButtonsHTML = `
            <button onclick="renderStudents()" class="flex items-center gap-2 text-gray-500 hover:text-emerald-700 mb-4 font-bold">
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
                العودة لقائمة ${getLabel('students')}
            </button>
        `;
    } else if (isStudent) {
        topButtonsHTML = ``;
    }

    container.innerHTML = `
        <div class="p-4 pb-24 max-w-lg mx-auto">
            ${topButtonsHTML}

            <!-- Student Header -->
            <div class="bg-gradient-to-r ${isStudent ? 'from-emerald-700 to-emerald-800' : 'from-emerald-600 to-emerald-700'} rounded-2xl p-6 mb-6 text-white shadow-lg">
                <div class="flex items-center gap-4">
                    <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center text-3xl border-4 border-white/50 overflow-hidden">
                        ${iconHtml}
                    </div>
                    <div>
                        <h1 class="text-xl font-bold">${student.name}</h1>
                        <p class="text-emerald-100 text-sm">${level.emoji} ${level.name}</p>
                        <p class="text-emerald-100 text-xs mt-1 flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i> المجموعة: ${groupName}</p>
                    </div>
                </div>
            </div>

            <!-- Quick Stats -->
            ${!_hideAgg ? `
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 text-center shadow-sm border">
                    <p class="text-2xl font-bold ${totalPoints >= 0 ? 'text-green-600' : 'text-red-600'}">${totalPoints}</p>
                    <p class="text-xs text-gray-500">إجمالي النقاط</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 text-center shadow-sm border">
                    <p class="text-2xl font-bold text-orange-600">${absenceDays}</p>
                    <p class="text-xs text-gray-500">أيام الغياب</p>
                </div>
            </div>
            <div id="student-ranking-card" class="mb-6">
                <div class="text-center py-2 text-gray-400 text-xs">جاري حساب الترتيب...</div>
            </div>
            ` : ''}

            <!-- Memorization Plan -->
            ${student.memorizationPlan || student.reviewPlan ? `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border">
                <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="book-open" class="w-4 h-4 text-emerald-700"></i> الخطة</h3>
                ${student.memorizationPlan ? `<p class="text-sm mb-2"><span class="font-bold text-emerald-700">الحفظ:</span> ${student.memorizationPlan}</p>` : ''}
                ${student.reviewPlan ? `<p class="text-sm"><span class="font-bold text-purple-600">المراجعة:</span> ${student.reviewPlan}</p>` : ''}
            </div>
            ` : ''}

            <!-- Quran Recitation Log (Removed) -->


            <!-- Visual Calendar -->
            ${calendarHTML}
            ${(isStudent) ? `
                <div class="mb-5 flex justify-center">
                    <button onclick="openQuranSearchModal()" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                        <i data-lucide="book-open" class="w-5 h-5"></i>
                         المصحف الشريف
                    </button>
                </div>
            ` : ''}

            <!-- Absence Details -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border">
                <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="calendar-x" class="w-4 h-4 text-orange-600"></i> تفاصيل الغياب</h3>
                <div class="grid grid-cols-2 gap-3">
                    <div onclick="showAbsenceDates('excuse')" class="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-emerald-400 transition">
                        <p class="text-xl font-bold text-emerald-800 dark:text-emerald-400">${absenceWithExcuse}</p>
                        <p class="text-xs text-emerald-700">بعذر ▸</p>
                    </div>
                    <div onclick="showAbsenceDates('noexcuse')" class="bg-red-50 dark:bg-red-900/30 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-red-400 transition">
                        <p class="text-xl font-bold text-red-700 dark:text-red-400">${absenceNoExcuse}</p>
                        <p class="text-xs text-red-600">بدون عذر ▸</p>
                    </div>
                </div>
            </div>

            <!-- Contact Teacher -->
            ${!state.isTeacher ? contactHTML : ''}
        </div>
    `;
    lucide.createIcons();
    
    // Render initial calendar
    setTimeout(() => {
        window.renderStudentCalendar(window._currentCalendarYear, window._currentCalendarMonth);
    }, 100);

    // Calculate ranking asynchronously (skip if scores are hidden for student)
    if (!_hideAgg) {
        calculateStudentRanking(studentId, student.level, totalPoints);
    }
}

// Calculate student ranking among peers
async function calculateStudentRanking(studentId, level, studentTotal) {
    const rankCard = document.getElementById('student-ranking-card');
    if (!rankCard) return;

    try {
        // Fetch all students in this level
        const studentsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", level)
        );
        const studentsSnap = await window.firebaseOps.getDocs(studentsQ);
        const allStudentIds = [];
        studentsSnap.forEach(d => allStudentIds.push(d.id));
        
        const totalStudents = allStudentIds.length;
        if (totalStudents <= 1) {
            rankCard.innerHTML = '';
            return;
        }

        // Fetch all scores for this level
        const scoresQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("level", "==", level)
        );
        const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
        
        // Calculate totals per student
        const totalsMap = {};
        allStudentIds.forEach(id => totalsMap[id] = 0);
        
        // Also calculate last 7 days and previous 7 days for trend
        const now = new Date();
        const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const prev7 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const todayStr = now.toISOString().split('T')[0];
        
        let thisWeekPoints = 0;
        let lastWeekPoints = 0;
        
        scoresSnap.forEach(d => {
            const sc = d.data();
            const pts = parseFloat(sc.points) || 0;
            if (totalsMap.hasOwnProperty(sc.studentId)) {
                totalsMap[sc.studentId] += pts;
            }
            // Trend for current student
            if (sc.studentId === studentId && sc.date) {
                if (sc.date >= last7 && sc.date <= todayStr) thisWeekPoints += pts;
                else if (sc.date >= prev7 && sc.date < last7) lastWeekPoints += pts;
            }
        });

        // Calculate rank
        const sortedTotals = Object.entries(totalsMap).sort((a, b) => b[1] - a[1]);
        const rank = sortedTotals.findIndex(([id]) => id === studentId) + 1;
        
        // Trend
        const trendDiff = thisWeekPoints - lastWeekPoints;
        let trendIcon = '➡️';
        let trendText = 'مستقر';
        let trendColor = 'text-gray-500';
        if (trendDiff > 0) { trendIcon = '📈'; trendText = `+${trendDiff} عن الأسبوع السابق`; trendColor = 'text-green-600'; }
        else if (trendDiff < 0) { trendIcon = '📉'; trendText = `${trendDiff} عن الأسبوع السابق`; trendColor = 'text-red-600'; }

        rankCard.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-xl font-bold text-amber-600">
                        ${rank}
                    </div>
                    <div>
                        <p class="font-bold text-sm text-gray-800 dark:text-gray-100">الترتيب ${rank} من ${totalStudents}</p>
                        <p class="text-xs ${trendColor}">${trendIcon} ${trendText}</p>
                    </div>
                </div>
                <div class="text-left">
                    <p class="text-xs text-gray-400">هذا الأسبوع</p>
                    <p class="font-bold ${thisWeekPoints >= 0 ? 'text-green-600' : 'text-red-600'}">${thisWeekPoints > 0 ? '+' : ''}${thisWeekPoints}</p>
                </div>
            </div>
        `;
    } catch (e) {
        console.warn('Ranking calculation failed:', e);
        rankCard.innerHTML = '';
    }
}

// ----------------------------------------
// Dynamic Calendar Logic
// ----------------------------------------
window.changeCalendarMonth = (offset) => {
    window._currentCalendarMonth += offset;
    if (window._currentCalendarMonth > 11) {
        window._currentCalendarMonth = 0;
        window._currentCalendarYear++;
    } else if (window._currentCalendarMonth < 0) {
        window._currentCalendarMonth = 11;
        window._currentCalendarYear--;
    }
    window.renderStudentCalendar(window._currentCalendarYear, window._currentCalendarMonth);
};

window.renderStudentCalendar = (year, month) => {
    const container = document.getElementById('student-calendar-container');
    if (!container) return;
    
    const scores = window._currentStudentScores || [];
    const todayDate = new Date();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    
    const scoresByDate = {};
    scores.forEach(s => {
        if (!s.date) return;
        if (!scoresByDate[s.date]) scoresByDate[s.date] = { points: 0, criteria: [], hasQuran: false, quranTypes: [], notes: [] };
        scoresByDate[s.date].points += (parseFloat(s.points) || 0);
        scoresByDate[s.date].criteria.push(s.criteriaName || (s.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : 'أخرى'));
        
        if (s.criteriaId === 'TEACHER_NOTE' && s.noteText) {
            scoresByDate[s.date].notes.push(s);
        }
        if (s.quranType) {
            scoresByDate[s.date].hasQuran = true;
            if (!scoresByDate[s.date].quranTypes.includes(s.quranType)) {
                scoresByDate[s.date].quranTypes.push(s.quranType);
            }
        }
    });
    
    let calendarDaysHTML = '';
    const weekdays = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    let calendarHeaderHTML = weekdays.map(d => `<div class="text-center text-xs font-bold text-gray-400 py-1">${d}</div>`).join('');
    
    for(let i = 0; i < firstDay; i++) {
        calendarDaysHTML += `<div class="p-2 opacity-0"></div>`;
    }
    
    for(let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayData = scoresByDate[dateStr];
        const plannedTasks = (window._currentStudentPlannedDays || []).filter(p => p.date === dateStr);

        let dayClass = 'bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center';
        let dayContent = `<span class="text-xs font-bold text-gray-400">${i}</span>`;
        
        let hasData = false;
        let dayContentTags = [];
        
        if (dayData) {
            hasData = true;
            const isAbsence = dayData.criteria.some(c => c && c.indexOf('غياب') !== -1);
            if (isAbsence) {
                dayClass = 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-red-400 transition';
                dayContentTags.push(`<span class="text-[10px] mt-0.5" title="${dayData.criteria.join(', ')}">❌</span>`);
            } else if (dayData.points > 0 || dayData.hasQuran || (dayData.notes && dayData.notes.length > 0)) {
                dayClass = 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-green-400 transition';
                if (dayData.points > 0) {
                    dayContentTags.push(`<span class="text-[10px] font-bold text-green-600 mt-0.5" title="${dayData.criteria.join(', ')}">+${dayData.points}</span>`);
                }
                if (dayData.hasQuran) {
                    let qIcons = '';
                    if (dayData.quranTypes.includes('memorization')) qIcons += '📝';
                    if (dayData.quranTypes.includes('review')) qIcons += '🔄';
                    if (dayData.quranTypes.includes('minor_review')) qIcons += '📗';
                    dayContentTags.push(`<span class="text-[10px] mt-0.5" title="سجل قرآن">${qIcons}</span>`);
                }
                if (dayData.notes && dayData.notes.length > 0) {
                    dayContentTags.push(`<span class="text-[10px] mt-0.5" title="ملاحظة من المعلم">💬</span>`);
                }
            } else if (dayData.points < 0) {
                dayClass = 'bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-orange-400 transition';
                dayContentTags.push(`<span class="text-[10px] font-bold text-orange-600 mt-0.5" title="${dayData.criteria.join(', ')}">${dayData.points}</span>`);
            }
        }
        
        if (plannedTasks.length > 0) {
            const hasHifz = plannedTasks.some(p => p.planType === 'memorization');
            const hasReview = plannedTasks.some(p => p.planType === 'review');
            
            if (!hasData) {
                dayClass = 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-300 dark:border-emerald-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-emerald-400 transition';
            }
            
            let dots = '';
            if (hasHifz) dots += `<span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>`;
            if (hasReview) dots += `<span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>`;
            dayContentTags.push(`<div class="flex gap-1 mt-1">${dots}</div>`);
        }

        if (dayData || plannedTasks.length > 0) {
            dayContent = `<span class="text-xs font-bold ${hasData ? (dayClass.includes('red') ? 'text-red-700 dark:text-red-400' : (dayClass.includes('green') ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400')) : 'text-emerald-800 dark:text-emerald-300'}">${i}</span>`;
            dayContent += `<div class="flex flex-col items-center justify-center">` + dayContentTags.join('') + `</div>`;
            calendarDaysHTML += `<div class="${dayClass}" onclick="showDayDetails('${dateStr}')">${dayContent}</div>`;
        } else if (dateStr === todayDate.toISOString().split('T')[0]) {
             dayClass = 'bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-400 dark:border-emerald-600 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center relative';
             dayContent = `<span class="text-xs font-bold text-emerald-700 dark:text-emerald-400">${i}</span>`;
             calendarDaysHTML += `<div class="${dayClass}" onclick="showDayDetails('${dateStr}')">${dayContent}</div>`;
        } else {
             calendarDaysHTML += `<div class="${dayClass}">${dayContent}</div>`;
        }
    }

    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const monthName = monthNames[month];

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold flex items-center gap-2"><i data-lucide="calendar" class="w-4 h-4 text-emerald-600"></i> التقويم الشهري</h3>
            <div class="flex items-center gap-2">
                <button onclick="changeCalendarMonth(-1)" class="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-emerald-100 text-emerald-700 transition"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                <span class="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">${monthName} ${year}</span>
                <button onclick="changeCalendarMonth(1)" class="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-emerald-100 text-emerald-700 transition"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
            </div>
        </div>
        <div class="space-y-1">
            <div class="grid grid-cols-7 gap-1">${calendarHeaderHTML}</div>
            <div class="grid grid-cols-7 gap-1 mt-1">${calendarDaysHTML}</div>
            <div class="flex items-center gap-3 mt-4 justify-center text-[10px] text-gray-500">
                <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500"></span> إضافة</div>
                <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-500"></span> خصم</div>
                <div class="flex items-center gap-1"><span class="w-3 h-3 flex items-center justify-center text-[8px]">❌</span> غياب</div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// Show specific day details for parent
window.showDayDetails = (dateStr) => {
    const scores = window._currentStudentScores || [];
    const dayScores = scores.filter(s => s.date === dateStr);
    const dayPlanItems = (window._currentStudentPlannedDays || []).filter(p => p.date === dateStr);
    
    if (dayScores.length === 0 && dayPlanItems.length === 0) return;

    // Plan info block
    let planHtml = '';
    if (dayPlanItems.length > 0) {
        planHtml = dayPlanItems.map(p => {
            const typeLabel = p.planType === 'memorization' ? '📝 خطة الحفظ' : p.planType === 'minor_review' ? '📗 مراجعة صغرى' : '🔄 خطة المراجعة';
            const typeColor = p.planType === 'memorization' ? 'emerald' : p.planType === 'minor_review' ? 'orange' : 'purple';
            const desc = typeof formatPlanDayDesc === 'function' ? formatPlanDayDesc(p.record?.plannedSections || []) : 'ورد اليوم';
            const statusMap = { pending: ['⏳ معلق','gray'], completed: ['✅ أنجز','green'], different: ['⚡ جزئي','amber'], absent: ['❌ غياب','red'] };
            const [statusLabel, sc] = statusMap[p.status] || ['⏳ معلق','gray'];
            const r = p.record || {};
            const startSu = r.plannedStartSura || r.planned_start_sura || 1;
            const startAy = r.plannedStartAyah || r.planned_start_ayah || 1;
            const endSu = r.plannedEndSura || r.planned_end_sura || startSu;
            const endAy = r.plannedEndAyah || r.planned_end_ayah || 1;

            return `
            <div class="bg-${typeColor}-50 dark:bg-${typeColor}-900/20 border border-${typeColor}-200 dark:border-${typeColor}-700 rounded-xl p-3 mb-3">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-bold text-${typeColor}-700 dark:text-${typeColor}-400">${typeLabel}</span>
                    <span class="text-xs font-bold px-2 py-0.5 bg-${sc}-100 text-${sc}-700 rounded-lg">${statusLabel}</span>
                </div>
                <p class="text-sm font-bold text-gray-700 dark:text-gray-200">${desc}</p>
                ${p.record?.plannedStartPage ? `<p class="text-[10px] text-gray-400 mt-0.5">ص${p.record.plannedStartPage} - ${p.record.plannedEndPage}</p>` : ''}
                
                <button onclick="window.openWardReader('${startSu}','${startAy}','${endSu}','${endAy}')" class="mt-2 w-full py-1.5 bg-${typeColor}-600 hover:bg-${typeColor}-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5">
                    <i data-lucide="book-open" class="w-3.5 h-3.5"></i> قراءة الورد
                </button>
            </div>`;
        }).join('');
    }

    let html = `<div class="space-y-3">${planHtml}`;

    if (dayScores.length > 0) {
        const grouped = {};
        dayScores.forEach(s => { grouped[s.criteriaId || s.criteriaName || Math.random()] = s; });
        const uniqueScores = Object.values(grouped);

        uniqueScores.forEach(s => {
            const isPositive = s.points > 0;
            const isAbsence = s.criteriaId === 'ABSENCE_RECORD';
            const isQuran = s.criteriaId === 'QURAN_MEMORIZATION' || s.criteriaId === 'QURAN_REVIEW';
            const isNote = s.criteriaId === 'TEACHER_NOTE';

            let badge = '';
            if (isQuran) {
                badge = `<span class="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800">${s.criteriaId === 'QURAN_MEMORIZATION' ? '📝 حفظ' : '🔄 مراجعة'}</span>`;
            } else if (isAbsence) {
                badge = `<span class="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700">غياب ❌</span>`;
            } else if (isNote) {
                badge = `<span class="text-xs font-bold px-2 py-1 rounded-lg bg-yellow-100 text-yellow-800">💬 ملاحظة</span>`;
            } else if (s.points === 0) {
                // For direct grading custom items
                badge = `<span class="text-xs font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-800">✓ تم الرصد</span>`;
            } else {
                badge = `<span class="text-sm font-bold px-2 py-1 rounded-lg ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${isPositive ? '+' : ''}${s.points}</span>`;
            }

            // Filter note visibility
            if (isNote && !state.isTeacher) {
                if (state.isParent && s.visibility === 'student') return; // Hide from parent
                if (!state.isParent && s.visibility === 'parent') return; // Hide from student
            }

            html += `
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-100 dark:border-gray-600">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-sm text-gray-800 dark:text-gray-100">${s.criteriaName || (isAbsence ? 'غياب' : 'تقييم')}</span>
                    ${badge}
                </div>
                ${isNote && s.noteText ? `
                <div class="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    ${s.noteText}
                </div>
                ` : ''}
                ${s.quranSection ? `
                <div class="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-lg">
                    <p class="text-xs font-bold text-emerald-800 dark:text-emerald-400 mb-1">📖 المقطع:</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 font-bold">${s.quranSection}</p>
                    ${s.quranGrade ? `<p class="text-xs font-bold mb-2 px-2 py-1 rounded-lg inline-block ${s.quranGrade === 'ممتاز' ? 'bg-green-100 text-green-700' : s.quranGrade === 'جيد جداً' ? 'bg-emerald-100 text-emerald-700' : s.quranGrade === 'مقبول' ? 'bg-yellow-100 text-yellow-700' : s.quranGrade === 'سيء' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}">🏅 التقدير: ${s.quranGrade}</p>` : ''}
                    <button onclick="window._openQuranForScore('${s.id}')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2">
                        <i data-lucide="book-open" class="w-4 h-4"></i> عرض الآيات
                    </button>
                </div>
                ` : ''}
            </div>
            `;
        });

        window._openQuranForScore = (scoreId) => {
            const score = uniqueScores.find(s => s.id === scoreId);
            if (!score || !score.quranStartSura || !score.quranEndSura) {
                showToast('التفاصيل الدقيقة للآيات غير متوفرة لهذا السجل القديم', 'error');
                return;
            }
            
            if (!window.QuranService || !window.QuranService.isLoaded()) {
                showToast('برجاء الانتظار لحين تحميل المصحف', 'error');
                return;
            }

            const sections = [];
        const startSura = Number(score.quranStartSura);
        const endSura = Number(score.quranEndSura);
        const startAya = Number(score.quranStartAya);
        const endAya = Number(score.quranEndAya);

        if (isNaN(startSura) || isNaN(endSura) || isNaN(startAya) || isNaN(endAya)) {
            showToast('بيانات الآيات غير مكتملة في هذا السجل', 'error');
            return;
        }

        const suras = window.QuranService.getSuras();
        if (startSura === endSura) {
            const sObj = suras.find(s => s.number == startSura);
            const allAyahsInSura = window.QuranService.getAyahs(startSura).filter(a => a.aya_no > 0);
            
            // Adjust old zeroes properly
            let safeStart = startAya > 0 ? startAya : 1;
            let safeEnd = endAya > 0 ? endAya : (allAyahsInSura.length > 0 ? Math.max(...allAyahsInSura.map(a => a.aya_no)) : 300);

            // Important: Fix the "shows 1 aya" issue where toAyah is less than fromAyah due to backwards old selection
            if (safeEnd < safeStart) {
                let temp = safeStart;
                safeStart = safeEnd;
                safeEnd = temp;
            }

            sections.push({
                suraNo: startSura,
                suraName: sObj ? sObj.name : startSura,
                fromAyah: safeStart,
                toAyah: safeEnd
            });
        } else {
            // سورة البداية
            const sObjStart = suras.find(s => s.number == startSura);
            const startAll = window.QuranService.getAyahs(startSura).filter(a => a.aya_no > 0);
            sections.push({
                suraNo: startSura,
                suraName: sObjStart ? sObjStart.name : startSura,
                fromAyah: startAya > 0 ? startAya : 1,
                toAyah: startAll.length > 0 ? Math.max(...startAll.map(a => a.aya_no)) : 300
            });
            
            // السور التي في المنتصف
            for (let i = startSura + 1; i < endSura; i++) {
                const mid = suras.find(s => s.number == i);
                const midAll = window.QuranService.getAyahs(i).filter(a => a.aya_no > 0);
                if (mid) {
                    sections.push({
                        suraNo: i,
                        suraName: mid.name,
                        fromAyah: 1,
                        toAyah: midAll.length > 0 ? Math.max(...midAll.map(a => a.aya_no)) : 300
                    });
                }
            }
            
            // سورة النهاية
            const sObjEnd = suras.find(s => s.number == endSura);
            sections.push({
                suraNo: endSura,
                suraName: sObjEnd ? sObjEnd.name : endSura,
                fromAyah: 1,
                toAyah: endAya > 0 ? endAya : 1
            });
        }
            const ayahsHtml = window.QuranService.getTextForSections(sections);
            
            let viewerModal = document.getElementById('quran-ayah-viewer');
            if (!viewerModal) {
                viewerModal = document.createElement('div');
                viewerModal.id = 'quran-ayah-viewer';
                document.body.appendChild(viewerModal);
            }
            viewerModal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in';
            viewerModal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                    <div class="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="font-bold text-lg text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                            <i data-lucide="book-open" class="w-5 h-5"></i>
                            عرض السور والآيات
                        </h3>
                        <button onclick="document.getElementById('quran-ayah-viewer').remove()" class="text-gray-400 hover:text-gray-600 bg-gray-50 dark:bg-gray-700 p-2 rounded-full transition">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div class="p-6 overflow-y-auto space-y-6">
                        ${ayahsHtml}
                    </div>
                </div>
            `;
            lucide.createIcons();
        };
    }

    html += `</div>`;

    let modal = document.getElementById('day-scores-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'day-scores-modal';
        document.body.appendChild(modal);
    }
    modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
                <h3 class="font-bold text-lg text-emerald-700 dark:text-emerald-400">📅 تفاصيل يوم ${dateStr}</h3>
                <button onclick="document.getElementById('day-scores-modal').remove()" class="text-gray-400 hover:text-gray-600 bg-gray-50 dark:bg-gray-700 rounded-full p-2">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            ${html}
        </div>
    `;
    lucide.createIcons();
};

function contactTeacher(studentName, teacherPhone) {
    let messageText = "";
    
    if (state.isParent) {
        messageText = state.currentLevel === 'ijazat'
            ? `السلام عليكم ورحمة الله وبركاته.. أنا أخوكم الدارس (${studentName})\nكنت أريد أن أستفسر عن بعض الأمور`
            : `السلام عليكم ورحمة الله وبركاته.. أنا ولي أمر الطالب (${studentName})\nكنت أريد أن أستفسر منك عن بعض الأمور`;
    } else {
        messageText = `السلام عليكم ورحمة الله وبركاته`;
    }

    const message = encodeURIComponent(messageText);
    window.open(`https://wa.me/${teacherPhone}?text=${message}`, '_blank');
}

function openTeacherSelectionModal() {
    const teachers = window._teachersForContact || [];
    const studentName = window._currentStudentName || '';

    if (teachers.length === 0) {
        showToast("لا يوجد معلمون مسجلون", "error");
        return;
    }

    // Create modal
    let modal = document.getElementById('teacher-selection-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'teacher-selection-modal';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-lg">اختر المعلم للتواصل</h3>
                <button onclick="document.getElementById('teacher-selection-modal').remove()" class="text-gray-400 hover:text-gray-600">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="space-y-3">
                ${teachers.map(t => `
                <button onclick="contactTeacher('${studentName}', '${t.phone}'); document.getElementById('teacher-selection-modal').remove();" 
                    class="w-full flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-green-50 dark:hover:bg-green-900/30 border hover:border-green-400 transition">
                    <div class="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center text-lg">👨‍🏫</div>
                    <div class="flex-1 text-right">
                        <p class="font-bold text-sm">${t.name}</p>
                        <p class="text-xs text-gray-500" dir="ltr">${t.phone}</p>
                    </div>
                    <i data-lucide="message-circle" class="w-5 h-5 text-green-600"></i>
                </button>
                `).join('')}
            </div>
        </div>
    `;

    lucide.createIcons();
}

// Show absence dates modal for parent view
function showAbsenceDates(type) {
    const records = type === 'excuse' ? window._absenceRecordsWithExcuse : window._absenceRecordsNoExcuse;
    const title = type === 'excuse' ? 'أيام الغياب بعذر' : 'أيام الغياب بدون عذر';
    const emoji = type === 'excuse' ? '✅' : '❌';

    // Use pre-built Tailwind classes instead of dynamic interpolation
    const bgCard = type === 'excuse' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800';
    const bgBadge = type === 'excuse' ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400';
    const textColor = type === 'excuse' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

    if (!records || records.length === 0) {
        showToast("لا يوجد أيام غياب مسجلة", "error");
        return;
    }

    // Create or reuse modal
    let modal = document.getElementById('absence-dates-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'absence-dates-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col">
            <!-- Header -->
            <div class="p-4 border-b flex justify-between items-center shrink-0">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <span class="text-xl">${emoji}</span>
                    ${title}
                </h3>
                <button onclick="document.getElementById('absence-dates-modal').remove()" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            
            <!-- Body -->
            <div class="p-4 flex-1 overflow-y-auto">
                <p class="text-sm text-gray-500 mb-3">إجمالي: ${records.length} يوم</p>
                <div class="space-y-2">
                    ${records.map((r, i) => `
                    <div class="flex items-center justify-between p-3 ${bgCard} rounded-xl border">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 ${bgBadge} rounded-lg flex items-center justify-center font-bold text-sm">${i + 1}</div>
                            <div>
                                <p class="font-bold text-gray-800 dark:text-gray-100">${r.date}</p>
                            </div>
                        </div>
                        <span class="${textColor} font-bold">${r.points} نقطة</span>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// Reset Competition Logic
let compToResetId = null;
function resetCompetition(id) {
    compToResetId = id;
    toggleModal('reset-competition-modal', true);
    document.getElementById('confirm-reset-comp-btn').onclick = performResetCompetition;
}

async function performResetCompetition() {
    if (!compToResetId) return;
    showToast("جاري تصفير الدرجات...");

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("competitionId", "==", compToResetId)
        );

        const snap = await window.firebaseOps.getDocs(q);
        const batch = window.firebaseOps.writeBatch(window.db);

        snap.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        showToast("تم تصفير المسابقة بنجاح");
        closeModal('reset-competition-modal');
        // Refresh home list
        renderHome();
    } catch (e) {
        console.error("Error resetting competition:", e);
        showToast("خطأ في تصفير المسابقة", "error");
    }
}

async function deleteGroup(groupId) {
    toggleModal('delete-modal-v2', true);

    const btn = document.getElementById('confirm-delete-btn-v2');
    if (btn) btn.onclick = async () => {
        try {
            await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "groups", groupId));
            showToast("تم حذف المجموعة بنجاح");
            closeModal('delete-modal-v2');
            // Reload groups list
            if (typeof fetchGroupsForCompetition === 'function' && typeof currentManageCompId !== 'undefined') {
                fetchGroupsForCompetition(currentManageCompId);
            }
        } catch (e) {
            console.error("Error deleting group:", e);
            showToast("خطأ في حذف المجموعة", "error");
        }
    };
}

// =====================================================
// FEATURE #7: Student Search/Filter
// =====================================================
function filterStudents(query) {
    if (!query || query.trim() === '') {
        updateStudentsListUI();
        return;
    }
    const q = query.trim().toLowerCase();
    const filtered = state.students.filter(s => {
        const nameMatch = s.name && s.name.toLowerCase().includes(q);
        const numMatch = s.studentNumber && s.studentNumber.includes(q);
        return nameMatch || numMatch;
    });
    updateStudentsListUI(filtered);
}

// Override updateStudentsListUI to accept optional filtered list
const _originalUpdateStudentsListUI = updateStudentsListUI;
updateStudentsListUI = function (filteredList) {
    const list = $('#students-list');
    if (!list) return;

    const students = filteredList || state.students;

    if (students.length === 0 && filteredList) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <i data-lucide="search-x" class="w-12 h-12 mb-3 opacity-20"></i>
                <p class="text-sm font-medium">لا توجد نتائج</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    if (students.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <i data-lucide="users" class="w-12 h-12 mb-3 opacity-20"></i>
                <p class="text-sm font-medium">لا يوجد ${getLabel('students')} حتى الآن</p>
                ${state.isTeacher ? `<p class="text-xs mt-1">اضغط على "جديد" لإضافة ${getLabel('students')}</p>` : ''}
            </div>
        `;
        lucide.createIcons();
        return;
    }

    list.innerHTML = students.map(student => {
        const isImg = student.icon && student.icon.startsWith('data:image');
        const iconHtml = isImg
            ? `<img src="${student.icon}" class="w-full h-full object-cover">`
            : (student.icon || '👤');

        return `
        <div class="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition group border-b border-gray-100 dark:border-gray-700 last:border-0">
            <div onclick="openStudentReport('${student.id}')" class="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-xl shadow-sm border border-gray-200 dark:border-gray-600 overflow-hidden cursor-pointer shrink-0">
                ${iconHtml}
            </div>
            <div class="flex-1 min-w-0" onclick="openStudentReport('${student.id}')" style="cursor:pointer">
                <h4 class="font-bold text-gray-800 dark:text-gray-100 truncate">${student.name}</h4>
                <div class="flex flex-wrap gap-1 text-xs text-gray-500 mt-0.5">
                    ${(state.isTeacher && student.studentNumber) ? `<span class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] text-gray-500 tracking-wider">${student.studentNumber}</span>` : ''}
                    ${student.password ? '<span class="text-green-500">🔐</span>' : '<span class="text-orange-400">⚠️ بدون كلمة مرور</span>'}
                </div>
            </div>
            <div class="flex gap-1 shrink-0">
                <button onclick="event.stopPropagation(); openEditStudent('${student.id}')" class="p-2 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition" title="تعديل">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                ${state.isTeacher ? `
                <button onclick="event.stopPropagation(); confirmDeleteStudent('${student.id}')" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="حذف">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
    lucide.createIcons();
};

// =====================================================
// FEATURE #1: Export Data (XLSX — Professional Excel)
// =====================================================

function downloadXLSX(filename, worksheets) {
    if (typeof XLSX === 'undefined') {
        showToast("مكتبة التصدير غير متوفرة، أعد تحميل الصفحة", "error");
        return;
    }
    const wb = XLSX.utils.book_new();
    worksheets.forEach(ws => {
        XLSX.utils.book_append_sheet(wb, ws.sheet, ws.name);
    });
    XLSX.writeFile(wb, filename);
}

async function exportStudentsXLSX() {
    showToast(`جاري تجهيز ملف ${getLabel('students')}...`);
    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);
        const students = [];
        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            students.push(d);
        });

        if (students.length === 0) {
        showToast(`لا يوجد ${getLabel('students')} للتصدير`, "error");
            return;
        }

        const levelName = LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : state.currentLevel;
        
        // Build rows
        const phoneHeader = state.currentLevel === 'ijazat' ? 'رقم الجوال' : 'جوال ولي الأمر';
        const rows = students.map((s, i) => ({
            '#': i + 1,
            'الاسم': s.name || '',
            [phoneHeader]: s.parentPhone || '',
            'المرحلة': levelName,
            'كلمة المرور': s.password || 'لم يتم التعيين',
            'رقم الهوية': s.nationalId || s.national_id || '',
            'آخر اختبار جمعية': s.lastAssociationExam || s.last_association_exam || '',
            'تاريخ الإضافة': s.createdAt ? new Date(s.createdAt).toLocaleDateString('ar-SA') : ''
        }));

        const ws = XLSX.utils.json_to_sheet(rows, { header: ['#', 'الاسم', phoneHeader, 'المرحلة', 'كلمة المرور', 'رقم الهوية', 'آخر اختبار جمعية', 'تاريخ الإضافة'] });
        
        // Set column widths
        ws['!cols'] = [
            { wch: 4 },  // #
            { wch: 25 }, // الاسم
            { wch: 15 }, // جوال ولي الأمر
            { wch: 18 }, // المرحلة
            { wch: 15 }, // كلمة المرور
            { wch: 15 }, // الهوية
            { wch: 20 }, // اختبار الجمعية
            { wch: 15 }, // التاريخ
        ];

        const date = new Date().toISOString().split('T')[0];
        downloadXLSX(`طلاب_${levelName}_${date}.xlsx`, [{ sheet: ws, name: 'الطلاب' }]);
        showToast(`تم تصدير ${students.length} طالب`);
    } catch (e) {
        console.error(e);
        showToast("خطأ في التصدير", "error");
    }
}

function openExportScoresModal() {
    let modal = document.getElementById('export-scores-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'export-scores-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    
    // Set default dates (last 30 days to today)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastMonth.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="file-spreadsheet" class="w-5 h-5 text-purple-600"></i>
                    تصدير التقرير الشامل
                </h3>
                <button onclick="closeModal('export-scores-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">من تاريخ</label>
                        <input type="date" id="export-start-date" value="${startStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">إلى تاريخ</label>
                        <input type="date" id="export-end-date" value="${endStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                </div>

                <button onclick="
                    const s = document.getElementById('export-start-date').value;
                    const e = document.getElementById('export-end-date').value;
                    closeModal('export-scores-modal');
                    exportScoresXLSX(s, e);
                " class="w-full mt-4 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition flex justify-center items-center gap-2">
                    <i data-lucide="download" class="w-5 h-5"></i> تحميل الإكسل
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

async function exportScoresXLSX(startDateStr, endDateStr) {
    showToast("جاري تجهيز ملف الدرجات...");
    try {
        // Fetch students
        const studentsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const studentsSnap = await window.firebaseOps.getDocs(studentsQ);
        const students = [];
        studentsSnap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            students.push(d);
        });

        if (students.length === 0) {
            showToast("لا يوجد طلاب", "error");
            return;
        }

        // Fetch scores filtered by level
        let scoresQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        
        // Cannot easily filter by date range if not indexed correctly or if multiple bounds, so we fetch all for level and filter in memory
        const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
        const scores = [];
        scoresSnap.forEach(doc => {
            const d = doc.data();
            if(startDateStr && endDateStr) {
                if (d.date >= startDateStr && d.date <= endDateStr) {
                    scores.push(d);
                }
            } else {
                scores.push(d);
            }
        });

        if (scores.length === 0) {
            showToast("لا يوجد درجات للتصدير في هذه المدة", "error");
            return;
        }

        const levelName = LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : state.currentLevel;

        // Build a map of criteria max points (using positivePoints as the daily max)
        const criteriaMaxMap = {};
        // Use all competitions just in case scores reference an inactive competition
        state.competitions.forEach(comp => {
            if (comp.criteria) {
                comp.criteria.forEach(crit => {
                    if (crit.name) {
                        criteriaMaxMap[crit.name] = Number(crit.positivePoints) || 0;
                        criteriaMaxMap[crit.name.trim()] = Number(crit.positivePoints) || 0;
                    }
                    if (crit.id) {
                        criteriaMaxMap[crit.id] = Number(crit.positivePoints) || 0;
                    }
                });
            }
        });

        const excludedCriteriaKeywords = ['حفظ', 'مراجع', 'ملاحظة'];

        // Map scores to students and find active dates per criteria
        const summaryMap = {};
        const activeDatesMap = {};
        
        students.forEach(s => {
            summaryMap[s.id] = { 
                name: s.name, 
                positive: 0, 
                negative: 0, 
                absences: 0,
                criteriaPoints: {},
                additionalPoints: 0
            };
        });

        scores.forEach(s => {
            if (!summaryMap[s.studentId]) return; // Skip if student not found
            
            const cName = s.criteriaName || s.criteriaId || 'عام';
            
            // Skip excluded criteria
            if (cName.includes('حفظ قرآن') || cName.includes('مراجعة قرآن') || cName.includes('مراجعه قرآن') || cName.includes('ملاحظة المعلم')) return;

            const pts = parseFloat(s.points) || 0;
            
            if (pts > 0) summaryMap[s.studentId].positive += pts;
            else if (pts < 0) summaryMap[s.studentId].negative += Math.abs(pts);
            
            if (s.criteriaId === 'ABSENCE_RECORD' || cName.includes('غياب')) {
                summaryMap[s.studentId].absences++;
            } else if (s.criteriaId && s.criteriaId.startsWith('CUSTOM_')) {
                summaryMap[s.studentId].additionalPoints += pts;
            } else {
                // Regular criteria
                if (!summaryMap[s.studentId].criteriaPoints[cName]) {
                    summaryMap[s.studentId].criteriaPoints[cName] = 0;
                }
                summaryMap[s.studentId].criteriaPoints[cName] += pts;
                
                // Track active dates for this criteria to calculate max possible
                if (!activeDatesMap[cName]) activeDatesMap[cName] = new Set();
                if (s.date) activeDatesMap[cName].add(s.date);
            }
        });

        // Calculate totals and sort to get ranks
        const studentStats = Object.values(summaryMap).map(s => {
            s.net = s.positive - s.negative;
            return s;
        }).sort((a, b) => b.net - a.net);

        // Assign ranks (handling ties)
        let currentRank = 1;
        let previousNet = null;
        studentStats.forEach((s, index) => {
            if (previousNet !== null && s.net < previousNet) {
                currentRank = index + 1;
            }
            s.rank = currentRank;
            previousNet = s.net;
        });

        // Get all unique criteria names used
        const allCriteriaNames = new Set();
        studentStats.forEach(s => {
            Object.keys(s.criteriaPoints).forEach(c => allCriteriaNames.add(c));
        });
        const criteriaList = Array.from(allCriteriaNames);

        // Sheet 1: Pivot Summary (The main requested view)
        const summaryRows = studentStats.map(s => {
            const row = {
                'المركز': s.rank,
                'اسم الطالب': s.name,
                'الفترة': `من ${startDateStr || 'البداية'} إلى ${endDateStr || 'النهاية'}`,
                'الصافي': s.net,
                'نقاط إضافية': s.additionalPoints > 0 ? `+${s.additionalPoints}` : (s.additionalPoints < 0 ? s.additionalPoints : 0),
                'أيام الغياب': s.absences
            };

            // Add each criteria breakdown
            criteriaList.forEach(cName => {
                const pts = s.criteriaPoints[cName] || 0;
                const baseMax = criteriaMaxMap[cName] || criteriaMaxMap[cName.trim()];
                
                if (baseMax && activeDatesMap[cName]) {
                    const totalMax = baseMax * activeDatesMap[cName].size;
                    row[cName] = `${pts} من ${totalMax}`;
                } else {
                    row[cName] = pts;
                }
            });

            return row;
        });

        const ws1 = XLSX.utils.json_to_sheet(summaryRows);
        
        // Dynamic column widths
        const cols = [
            { wch: 8 },  // المركز
            { wch: 25 }, // الاسم
            { wch: 28 }, // الفترة
            { wch: 10 }, // الصافي
            { wch: 15 }, // إضافية
            { wch: 12 }  // الغياب
        ];
        criteriaList.forEach(() => cols.push({ wch: 20 }));
        ws1['!cols'] = cols;

        // Sheet 2: All Scores Detail
        const detailRows = scores.map(s => ({
            'اسم الطالب': summaryMap[s.studentId] ? summaryMap[s.studentId].name : 'غير معروف',
            'المعيار': s.criteriaName || s.criteriaId || '',
            'النقاط': parseFloat(s.points) || 0,
            'النوع': s.type === 'positive' ? 'إيجابي' : (s.type === 'negative' ? 'سلبي' : s.type),
            'التاريخ': s.date || ''
        }));
        const ws2 = XLSX.utils.json_to_sheet(detailRows);
        ws2['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];

        const date = new Date().toISOString().split('T')[0];
        downloadXLSX(`درجات_${levelName}_${date}.xlsx`, [
            { sheet: ws1, name: 'التقرير الشامل' },
            { sheet: ws2, name: 'سجل الحركات (تفصيلي)' }
        ]);
        showToast(`تم تصدير تقرير التقييم الشامل بنجاح`);
    } catch (e) {
        console.error(e);
        showToast("خطأ في التصدير", "error");
    }
}

// =====================================================
// AUDIT LOG — Logs critical operations to Supabase
// =====================================================
async function logAuditEvent(action, entityType, entityId = null, details = null) {
    try {
        await window.firebaseOps.addDoc(
            window.firebaseOps.collection(window.db, "audit_log"),
            {
                action: action,
                entityType: entityType,
                entityId: entityId || '',
                details: details || {},
                level: state.currentLevel || '',
                role: state.isTeacher ? 'teacher' : 'student',
                deviceInfo: navigator.userAgent
            }
        );
    } catch (e) {
        console.warn('Audit log failed (non-critical):', e);
    }
}

// =====================================================
// AUTO BACKUP — Runs silently on teacher login
// =====================================================
async function checkAndRunAutoBackup() {
    if (!state.isTeacher || !state.currentLevel) return;
    
    try {
        // Check last backup for this level
        const backupsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "backups"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const backupsSnap = await window.firebaseOps.getDocs(backupsQ);
        
        let lastBackup = null;
        let lastBackupId = null;
        backupsSnap.forEach(doc => {
            const d = doc.data();
            if (!lastBackup || new Date(d.createdAt) > new Date(lastBackup.createdAt)) {
                lastBackup = d;
                lastBackupId = doc.id;
            }
        });

        // Check if 7 days have passed
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        if (lastBackup && new Date(lastBackup.createdAt) > sevenDaysAgo) {
            return; // Backup is recent enough
        }

        // Perform backup — gather all data for this level
        const [studentsSnap, compsSnap, groupsSnap, scoresSnap] = await Promise.all([
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "students"),
                window.firebaseOps.where("level", "==", state.currentLevel)
            )),
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "competitions"),
                window.firebaseOps.where("level", "==", state.currentLevel)
            )),
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "groups"),
                window.firebaseOps.where("level", "==", state.currentLevel)
            )),
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("level", "==", state.currentLevel)
            ))
        ]);

        const backupData = {
            students: [],
            competitions: [],
            groups: [],
            scores: [],
            backupDate: now.toISOString(),
            level: state.currentLevel
        };

        studentsSnap.forEach(d => { const data = d.data(); data.id = d.id; backupData.students.push(data); });
        compsSnap.forEach(d => { const data = d.data(); data.id = d.id; backupData.competitions.push(data); });
        groupsSnap.forEach(d => { const data = d.data(); data.id = d.id; backupData.groups.push(data); });
        scoresSnap.forEach(d => { const data = d.data(); data.id = d.id; backupData.scores.push(data); });

        // Delete old backup for this level (if exists)
        if (lastBackupId) {
            await window.firebaseOps.deleteDoc(
                window.firebaseOps.doc(window.db, "backups", lastBackupId)
            );
        }

        // Save new backup
        await window.firebaseOps.addDoc(
            window.firebaseOps.collection(window.db, "backups"),
            {
                level: state.currentLevel,
                backupData: backupData
            }
        );
        
        console.log(`Auto backup completed for ${state.currentLevel}: ${backupData.students.length} students, ${backupData.scores.length} scores`);
    } catch (e) {
        console.warn('Auto backup failed (non-critical):', e);
    }
}

// Audit log removed by user request

// =====================================================
// FEATURE #5: Statistics with Canvas Charts
// =====================================================

async function openStatsModal() {
    let modal = document.getElementById('stats-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stats-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
            <div class="p-4 border-b flex justify-between items-center shrink-0">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="bar-chart-3" class="w-5 h-5 text-amber-600"></i>
                    إحصائيات المرحلة
                </h3>
                <button onclick="document.getElementById('stats-modal').remove()" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div id="stats-content" class="p-4 flex-1 overflow-y-auto">
                <div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>
            </div>
        </div>
    `;
    lucide.createIcons();

    try {
        // Fetch students
        const studentsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const studentsSnap = await window.firebaseOps.getDocs(studentsQ);
        const students = [];
        studentsSnap.forEach(doc => { const d = doc.data(); d.id = doc.id; students.push(d); });

        // Fetch scores
        const scoresQ = window.firebaseOps.query(window.firebaseOps.collection(window.db, "scores"));
        const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
        const allScores = [];
        scoresSnap.forEach(doc => { allScores.push(doc.data()); });

        const studentIds = students.map(s => s.id);
        const scores = allScores.filter(s => studentIds.includes(s.studentId));

        // Calculate stats
        const totalStudents = students.length;
        const totalScoreRecords = scores.length;
        const totalPoints = scores.reduce((sum, s) => sum + (s.points || 0), 0);
        const absences = scores.filter(s => s.criteriaId === 'ABSENCE_RECORD').length;

        // Student totals for chart
        const studentTotals = {};
        scores.forEach(s => {
            studentTotals[s.studentId] = (studentTotals[s.studentId] || 0) + (s.points || 0);
        });

        // Top 10 students
        const ranked = students.map(s => ({ name: s.name, total: studentTotals[s.id] || 0 }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // Daily activity (last 14 days)
        const dailyData = {};
        const today = new Date();
        for (let i = 13; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyData[key] = 0;
        }
        scores.forEach(s => {
            if (s.date && dailyData.hasOwnProperty(s.date) && s.points > 0) {
                dailyData[s.date] += s.points;
            }
        });

        const levelName = LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '';
        const container = document.getElementById('stats-content');

        container.innerHTML = `
            <!-- Summary Cards -->
            <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-800">
                    <p class="text-2xl font-bold text-emerald-700">${totalStudents}</p>
                    <p class="text-xs text-emerald-800 dark:text-emerald-400">طالب</p>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center border border-green-100 dark:border-green-800">
                    <p class="text-2xl font-bold text-green-600">${totalPoints}</p>
                    <p class="text-xs text-green-700 dark:text-green-400">إجمالي النقاط</p>
                </div>
                <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-800">
                    <p class="text-2xl font-bold text-emerald-600">${totalScoreRecords}</p>
                    <p class="text-xs text-emerald-700 dark:text-emerald-400">تقييم مسجل</p>
                </div>
                <div class="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-center border border-orange-100 dark:border-orange-800">
                    <p class="text-2xl font-bold text-orange-600">${absences}</p>
                    <p class="text-xs text-orange-700 dark:text-orange-400">حالة غياب</p>
                </div>
            </div>

            <!-- Top Students Chart -->
            <div class="bg-white dark:bg-gray-700/50 rounded-xl p-4 border mb-4">
                <h4 class="font-bold text-sm mb-3 flex items-center gap-2">
                    <span>🏆</span> أعلى 10 طلاب نقاطاً
                </h4>
                <canvas id="students-chart" width="400" height="250"></canvas>
            </div>

            <!-- Daily Activity Chart -->
            <div class="bg-white dark:bg-gray-700/50 rounded-xl p-4 border">
                <h4 class="font-bold text-sm mb-3 flex items-center gap-2">
                    <span>📈</span> النشاط اليومي (آخر 14 يوم)
                </h4>
                <canvas id="daily-chart" width="400" height="200"></canvas>
            </div>
        `;

        // Draw Charts
        setTimeout(() => {
            drawBarChart('students-chart', ranked.map(s => s.name), ranked.map(s => s.total), '#064e3b');
            drawBarChart('daily-chart', Object.keys(dailyData).map(d => d.slice(5)), Object.values(dailyData), '#f59e0b');
        }, 100);

    } catch (e) {
        console.error(e);
        document.getElementById('stats-content').innerHTML = '<p class="text-center text-red-500 py-8">خطأ في تحميل الإحصائيات</p>';
    }
}

function drawBarChart(canvasId, labels, values, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 10, bottom: 40, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const maxVal = Math.max(...values, 1);
    const barWidth = chartW / labels.length * 0.7;
    const gap = chartW / labels.length * 0.3;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? '#374151' : '#e5e7eb';

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + chartH - (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();

        // Y-axis label
        ctx.fillStyle = textColor;
        ctx.font = '10px Tajawal, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxVal / 4 * i), padding.left - 5, y + 3);
    }

    // Bars
    labels.forEach((label, i) => {
        const x = padding.left + i * (barWidth + gap) + gap / 2;
        const barH = (values[i] / maxVal) * chartH;
        const y = padding.top + chartH - barH;

        // Bar gradient
        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color + '99');
        ctx.fillStyle = gradient;

        // Rounded top corners
        const radius = Math.min(4, barWidth / 2);
        ctx.beginPath();
        ctx.moveTo(x, y + barH);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, y + barH);
        ctx.fill();

        // Value on top
        ctx.fillStyle = textColor;
        ctx.font = 'bold 10px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        if (values[i] > 0) {
            ctx.fillText(values[i], x + barWidth / 2, y - 4);
        }

        // X-axis label
        ctx.fillStyle = textColor;
        ctx.font = '9px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        // Truncate label
        const maxLabelLen = Math.max(3, Math.floor(barWidth / 6));
        const truncated = label.length > maxLabelLen ? label.substring(0, maxLabelLen) + '..' : label;
        ctx.fillText(truncated, x + barWidth / 2, h - padding.bottom + 15);
    });
}

// =====================================================
// FEATURE #9: Offline Mode (IndexedDB Cache)
// =====================================================

const OfflineCache = {
    DB_NAME: 'ibnTaymiyyahCache',
    DB_VERSION: 1,
    STORE_NAME: 'dataCache',

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async save(key, data) {
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.put({ key, data, timestamp: Date.now() });
            return new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = reject;
            });
        } catch (e) {
            console.warn('OfflineCache save error:', e);
        }
    },

    async load(key, maxAgeMs = 1000 * 60 * 60) {
        // maxAgeMs: default 1 hour
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.get(key);
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && (Date.now() - result.timestamp) < maxAgeMs) {
                        resolve(result.data);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            console.warn('OfflineCache load error:', e);
            return null;
        }
    },

    async clear() {
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).clear();
        } catch (e) {
            console.warn('OfflineCache clear error:', e);
        }
    }
};

// Cache data after successful fetches
(function enableOfflineCache() {
    const origGetDocs = window.firebaseOps.getDocs;

    window.firebaseOps.getDocs = async function (queryOrCollection) {
        const tableName = queryOrCollection._table;
        const cacheKey = `getDocs_${tableName}_${JSON.stringify(queryOrCollection._constraints || [])}`;

        try {
            const result = await origGetDocs.call(this, queryOrCollection);
            // Cache the raw data for offline use
            const rawDocs = [];
            result.forEach(doc => { rawDocs.push({ id: doc.id, data: doc.data() }); });
            OfflineCache.save(cacheKey, rawDocs);
            return result;
        } catch (e) {
            // Offline - try to load from cache
            console.warn('getDocs failed, trying offline cache:', e.message);
            const cached = await OfflineCache.load(cacheKey, 1000 * 60 * 60 * 24); // 24 hour cache for offline
            if (cached) {
                showToast("وضع عدم الاتصال - بيانات مخزنة مؤقتاً", "info");
                const docs = cached.map(item => ({
                    id: item.id,
                    data: () => item.data,
                    ref: { _table: tableName, _id: item.id, _type: 'doc' }
                }));
                return {
                    empty: docs.length === 0,
                    docs: docs,
                    forEach: (cb) => docs.forEach(cb),
                    size: docs.length
                };
            }
            throw e; // No cache available, rethrow
        }
    };
})();

// =====================================================
// FEATURE #10: Custom Ad-hoc Points
// =====================================================
let isGroupCustomPoints = false;
function openCustomPointsModal(isGroup = false) {
    isGroupCustomPoints = isGroup;
    closeModal('rate-student-modal');

    let modal = document.getElementById('custom-points-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-points-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    const titleText = isGroup ? "نقاط مخصصة للمجموعة بأكملها" : "نقاط مخصصة للطالب";

    modal.className = 'fixed inset-0 bg-black/50 z-[200] hidden flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="sparkles" class="w-5 h-5 text-emerald-700"></i>
                    ${titleText}
                </h3>
                <button onclick="closeModal('custom-points-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            
            <form onsubmit="submitCustomPoints(event)" class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">سبب التقييم</label>
                    <input type="text" id="custom-points-reason" required placeholder="مثال: مشاركة متميزة، سلوك سيء..." 
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-600">
                </div>
                
                <div>
                    <label class="block text-sm font-bold mb-2">عدد النقاط</label>
                    <input type="number" id="custom-points-value" required placeholder="10" step="0.25"
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-center text-2xl font-bold focus:outline-none focus:border-emerald-600" dir="ltr">
                    <p class="text-xs text-gray-500 mt-2 text-center">أدخل رقماً موجباً للزيادة (5) أو سالباً للخصم (-3)</p>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('custom-points-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button type="submit" class="flex-1 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-800 shadow-lg transition">تأكيد الرصد</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
    toggleModal('custom-points-modal', true);
}

async function submitCustomPoints(e) {
    e.preventDefault();
    const reasonStr = document.getElementById('custom-points-reason').value;
    const pointsStr = document.getElementById('custom-points-value').value;
    const points = parseFloat(pointsStr);
    
    if(!reasonStr || isNaN(points)) {
        showToast("الرجاء التحقق من البيانات المطلوبة", "error");
        return;
    }

    const studentId = currentRateStudentId; 
    const compId = currentGradingCompId;
    const dateVal = document.getElementById('grading-date') ? document.getElementById('grading-date').value : new Date().toISOString().split('T')[0];

    if(!isGroupCustomPoints && !studentId) {
        showToast("خطأ: لم يتم تحديد الطالب", "error");
        return;
    }
    if(isGroupCustomPoints && !currentGradingGroupId) {
        showToast("خطأ: لم يتم تحديد المجموعة", "error");
        return;
    }

    const btn = e.submitter;
    const prevText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>';
    btn.disabled = true;
    lucide.createIcons();

    try {
        const batch = window.firebaseOps.writeBatch(window.db);
        const criteriaIdStr = 'CUSTOM_' + Date.now().toString();

        let targetStudentIds = [];
        if (isGroupCustomPoints) {
            const group = state.groups.find(g => g.id === currentGradingGroupId);
            if(group && group.members) targetStudentIds = group.members;
        } else {
            targetStudentIds = [studentId];
        }

        if(targetStudentIds.length === 0) {
            showToast("لا يوجد طلاب لرصد الدرجة لهم", "error");
            btn.innerHTML = prevText;
            btn.disabled = false;
            return;
        }

        targetStudentIds.forEach(sid => {
            const scoreData = {
                studentId: sid,
                competitionId: compId,
                groupId: currentGradingGroupId || null,
                criteriaId: criteriaIdStr,
                criteriaName: 'تقييم مخصص: ' + reasonStr,
                points: points,
                type: points > 0 ? 'custom_positive' : 'custom_negative',
                level: state.currentLevel,
                date: dateVal,
                updatedAt: new Date(),
                timestamp: Date.now(),
                createdAt: new Date()
            };
            batch.set(window.firebaseOps.doc(window.db, "scores", "temp_" + sid + "_" + Date.now().toString()), scoreData);
        });

        await batch.commit();
        showToast(`تم رصد ${points > 0 ? '+' : ''}${points} للمجموعة/الطالب بنجاح`, points > 0 ? "success" : "error");
        
        closeModal('custom-points-modal');
    } catch(err) {
        console.error("Custom points error:", err);
        showToast("حدث خطأ أثناء الرصد", "error");
    } finally {
        btn.innerHTML = prevText;
        btn.disabled = false;
    }
}

// =====================================================
// FEATURE #11: Group-Level Points (group_scores)
// لا يتأثر أي طالب - النقاط تُضاف لاسم المجموعة فقط
// =====================================================
function openGroupPointsModal() {
    const groupId = currentGradingGroupId;
    const group = state.groups.find(g => g.id === groupId);
    if (!group) {
        showToast("لم يتم تحديد المجموعة", "error");
        return;
    }

    let modal = document.getElementById('group-points-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'group-points-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[200] hidden flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <div>
                    <h3 class="font-bold text-lg flex items-center gap-2">
                        <i data-lucide="shield" class="w-5 h-5 text-amber-600"></i>
                        نقاط المجموعة
                    </h3>
                    <p class="text-xs text-gray-500 mt-1">لا تُوزَّع على الطلاب — تُضاف للمجموعة فقط</p>
                </div>
                <button onclick="closeModal('group-points-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 mb-4 flex items-center gap-3 border border-amber-200 dark:border-amber-800">
                <div class="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-2xl shrink-0">
                    ${isImgSrc(group.icon) ? `<img src="${group.icon}" class="w-full h-full object-cover">` : (group.icon || '🛡️')}
                </div>
                <div>
                    <p class="font-bold text-amber-800 dark:text-amber-300">${group.name}</p>
                    <p class="text-xs text-amber-600 dark:text-amber-400">النقاط ستُسجَّل لهذه المجموعة</p>
                </div>
            </div>


            <form onsubmit="submitGroupPoints(event)" class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">سبب المنح / الخصم</label>
                    <input type="text" id="group-points-reason" required
                        placeholder="مثال: فوز في مسابقة، عقوبة جماعية..."
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500">
                </div>

                <div>
                    <label class="block text-sm font-bold mb-2">عدد النقاط</label>
                    <input type="number" id="group-points-value" required placeholder="10" step="0.25"
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-center text-2xl font-bold focus:outline-none focus:border-amber-500" dir="ltr">
                    <p class="text-xs text-gray-500 mt-2 text-center">موجب للإضافة (+10) أو سالب للخصم (-5)</p>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('group-points-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button type="submit" class="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 shadow-lg transition">تأكيد</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
    toggleModal('group-points-modal', true);
}

async function submitGroupPoints(e) {
    e.preventDefault();
    const reason = document.getElementById('group-points-reason').value.trim();
    const points = parseFloat(document.getElementById('group-points-value').value);
    const groupId = currentGradingGroupId;
    const compId = currentGradingCompId;
    const dateVal = document.getElementById('grading-date') ? document.getElementById('grading-date').value : new Date().toISOString().split('T')[0];

    if (!reason || isNaN(points)) {
        showToast("يرجى إدخال السبب والنقاط", "error");
        return;
    }
    if (!groupId || !compId) {
        showToast("خطأ: لم يتم تحديد المجموعة أو المسابقة", "error");
        return;
    }

    const btn = e.submitter;
    const prevText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>';
    btn.disabled = true;
    lucide.createIcons();

    try {
        await window.firebaseOps.addDoc(
            window.firebaseOps.collection(window.db, "group_scores"),
            {
                groupId: groupId,
                competitionId: compId,
                reason: reason,
                points: points,
                type: points > 0 ? 'group_bonus' : 'group_penalty',
                level: state.currentLevel,
                date: dateVal,
                createdAt: new Date(),
                timestamp: Date.now()
            }
        );

        const group = state.groups.find(g => g.id === groupId);
        const groupName = group ? group.name : 'المجموعة';
        showToast(`تم رصد ${points > 0 ? '+' : ''}${points} نقطة لـ "${groupName}" بنجاح`, points > 0 ? "success" : "error");
        closeModal('group-points-modal');
    } catch(err) {
        console.error("Group points error:", err);
        showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        btn.innerHTML = prevText;
        btn.disabled = false;
    }
}

// =====================================================
// FEATURE: Bulk WhatsApp Queue Generator
// =====================================================
let bulkWhatsAppQueue = [];
let bulkWhatsAppCurrentIndex = 0;

function openBulkWhatsAppModal() {
    let modal = document.getElementById('bulk-wa-start-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulk-wa-start-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }
    modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2 text-emerald-600">
                    <i data-lucide="message-circle" class="w-5 h-5"></i>إعداد المراسلة المجمعة
                </h3>
                <button onclick="closeModal('bulk-wa-start-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">المسابقة المستهدفة</label>
                    <select id="wa-comp-select" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-3">
                        ${state.competitions.filter(c => !c.level || c.level === state.currentLevel).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">من تاريخ</label>
                        <input type="date" id="wa-start-date" value="${startStr}" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-3 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">إلى تاريخ</label>
                        <input type="date" id="wa-end-date" value="${endStr}" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-3 text-sm">
                    </div>
                </div>
                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('bulk-wa-start-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 transition">إلغاء</button>
                    <button onclick="buildWhatsAppQueue(this)" class="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg flex justify-center items-center gap-2"><i data-lucide="list-checks" class="w-5 h-5"></i> تجهيز القائمة</button>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
    toggleModal('bulk-wa-start-modal', true);
}

async function buildWhatsAppQueue(btn) {
    const compId = $('#wa-comp-select').value;
    const startDate = $('#wa-start-date').value;
    const endDate = $('#wa-end-date').value;
    const compName = $('#wa-comp-select').options[$('#wa-comp-select').selectedIndex].text;
    if (!compId || !startDate || !endDate) return showToast('يرجى تعبئة الحقول', 'error');

    const prevHTML = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> جلب...';
    btn.disabled = true;
    lucide.createIcons();

    try {
        const groups = state.groups.filter(g => g.competitionId === compId);
        const sSnap = await window.firebaseOps.getDocs(window.firebaseOps.query(window.firebaseOps.collection(window.db, "scores"), window.firebaseOps.where("competitionId", "==", compId)));
        
        const comp = state.competitions.find(c => c.id === compId);
        if (!comp) throw new Error("Competition not found");

        let d = new Date(startDate);
        let e = new Date(endDate);
        const dateStrings = [];
        let totalDaysPassed = 0;
        const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const activeDaysList = state.activeWeekDays || ['sun', 'mon', 'tue', 'wed', 'thu'];

        while (d <= e) {
            const dayStr = dayMap[d.getDay()];
            if (activeDaysList.includes(dayStr)) {
                const ys = d.getFullYear();
                const ms = String(d.getMonth() + 1).padStart(2, '0');
                const ds = String(d.getDate()).padStart(2, '0');
                dateStrings.push(`${ys}-${ms}-${ds}`);
                totalDaysPassed++;
            }
            d.setDate(d.getDate() + 1);
        }

        const actSnap = await window.firebaseOps.getDocs(window.firebaseOps.query(window.firebaseOps.collection(window.db, "activity_days"), window.firebaseOps.where("competitionId", "==", compId)));
        let activityDaysCount = 0;
        let totalActivityPossible = 0;
        actSnap.forEach(doc => {
            const data = doc.data();
            if (data.date >= startDate && data.date <= endDate && dateStrings.includes(data.date)) {
                activityDaysCount++;
                totalActivityPossible += parseFloat(data.points) || 0;
            }
        });

        const normalDaysCount = totalDaysPassed - activityDaysCount;

        bulkWhatsAppQueue = [];
        groups.forEach(g => {
            if (g.members) {
                g.members.forEach(mId => {
                    const st = state.students.find(s => s.id === mId);
                    if (st && st.studentNumber && st.studentNumber.trim() !== "") {
                        let totalEarned = 0;
                        let totalPossible = 0;
                        
                        let reportText = `📊 *تقرير الفترة السابقة* 📊\n`;
                        reportText += `👤 الطالب: ${st.name}\n`;
                        reportText += `📅 الفترة: ${startDate} إلى ${endDate}\n`;
                        if (activityDaysCount > 0) reportText += `🎪 تم إقامة نشاط (${activityDaysCount} يوم)\n`;
                        reportText += `------------------\n`;
                        
                        if (comp.criteria) {
                             comp.criteria.forEach(c => {
                                 let earned = 0;
                                 sSnap.forEach(doc => {
                                     let sc = doc.data();
                                     if(sc.studentId === st.id && sc.criteriaId === c.id && sc.date >= startDate && sc.date <= endDate) {
                                         earned += parseFloat(sc.points) || 0;
                                     }
                                 });
                                 let possible = (parseFloat(c.positivePoints) || 0) * normalDaysCount;
                                 reportText += `🔹 ${c.name}: ${earned} / ${possible}\n`;
                                 totalEarned += earned;
                                 totalPossible += possible;
                             });
                        }
                        
                        if (activityDaysCount > 0) {
                             let actEarned = 0;
                             sSnap.forEach(doc => {
                                 let sc = doc.data();
                                 if(sc.studentId === st.id && sc.criteriaId === 'ACTIVITY_DAY' && sc.date >= startDate && sc.date <= endDate) {
                                     actEarned += parseFloat(sc.points) || 0;
                                 }
                             });
                             reportText += `🏃 نقاط النشاط: ${actEarned} / ${totalActivityPossible}\n`;
                             totalEarned += actEarned;
                             totalPossible += totalActivityPossible;
                        }
                        
                        let absentDays = [];
                        let deduction = 0;
                        sSnap.forEach(doc => {
                             let sc = doc.data();
                             if(sc.studentId === st.id && sc.criteriaId === 'ABSENCE_RECORD' && sc.date >= startDate && sc.date <= endDate) {
                                 deduction += parseFloat(sc.points) || 0;
                                 absentDays.push(`${sc.date} (${sc.criteriaName || 'غياب'})`);
                             }
                        });
                        if (absentDays.length > 0) {
                             reportText += `⚠️ خصم غياب: ${deduction}\n`;
                             reportText += `❌ أيام الغياب:\n${absentDays.join('\n')}\n`;
                             totalEarned += deduction;
                        }
                        
                        reportText += `------------------\n`;
                        reportText += `✨ *المجموع النهائي: ${totalEarned} / ${totalPossible}*\n`;
                        reportText += `\nشاكرين تعاونكم 🌹`;

                        bulkWhatsAppQueue.push({
                            id: st.id,
                            name: st.name,
                            phone: st.studentNumber,
                            text: reportText,
                            sent: false
                        });
                    }
                });
            }
        });

        if (bulkWhatsAppQueue.length === 0) {
            showToast("لا يوجد أرقام جوال مسجلة للطلاب", "error");
            return;
        }

        bulkWhatsAppCurrentIndex = 0;
        closeModal('bulk-wa-start-modal');
        showBulkWhatsAppRunner();

    } catch (e) {
        console.error(e);
        showToast("خطأ أثناء تجهيز القائمة", "error");
    } finally {
        btn.innerHTML = prevHTML;
        btn.disabled = false;
    }
}

function showBulkWhatsAppRunner() {
    let modal = document.getElementById('bulk-wa-runner-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulk-wa-runner-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }
    
    modal.className = 'fixed inset-0 bg-gray-50 dark:bg-gray-900 z-[200] flex flex-col animate-fade-in';
    renderBulkWhatsAppList();
    toggleModal('bulk-wa-runner-modal', true);
}

function renderBulkWhatsAppList() {
    let modal = document.getElementById('bulk-wa-runner-modal');
    const sentCount = bulkWhatsAppQueue.filter(item => item.sent).length;
    const progressPct = bulkWhatsAppQueue.length > 0 ? Math.round((sentCount / bulkWhatsAppQueue.length) * 100) : 0;

    let html = `
        <div class="bg-white dark:bg-gray-800 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] px-4 py-4 flex justify-between items-center shrink-0 border-b border-gray-100 dark:border-gray-700 z-10 relative">
            <div>
                <h2 class="font-bold text-lg text-emerald-600 flex items-center gap-2"><i data-lucide="send" class="w-5 h-5"></i> نظام المراسلة المجمعة</h2>
                <p class="text-xs text-gray-500 mt-1">تم تجهيز ${bulkWhatsAppQueue.length} رسالة (أُرسل منها ${sentCount})</p>
            </div>
            <button onclick="closeModal('bulk-wa-runner-modal')" class="text-gray-400 hover:text-gray-600 p-2 bg-gray-100 dark:bg-gray-700 rounded-full"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        
        <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-700 shrink-0 relative">
            <div class="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" style="width: ${progressPct}%"></div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3 pb-safe">
    `;

    bulkWhatsAppQueue.forEach((item, index) => {
        const isCurrent = index === bulkWhatsAppCurrentIndex;
        let phoneStr = item.phone.replace(/\\D/g, '');
        if (phoneStr.startsWith('05') && phoneStr.length === 10) {
            phoneStr = '966' + phoneStr.substring(1);
        }

        const encodedText = encodeURIComponent(item.text);
        const waLink = `https://api.whatsapp.com/send?phone=${phoneStr}&text=${encodedText}`;

        html += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border ${isCurrent ? 'border-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-900/40 transform scale-[1.02]' : (item.sent ? 'border-gray-100 dark:border-gray-700 opacity-60' : 'border-gray-200 dark:border-gray-700')} flex items-center justify-between transition-all duration-300">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${item.sent ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}">
                        ${index + 1}
                    </div>
                    <div>
                        <p class="font-bold text-sm ${item.sent ? 'text-emerald-700 dark:text-emerald-400' : ''}">${item.name}</p>
                        <p class="text-xs text-gray-500 dir-ltr">${item.phone}</p>
                    </div>
                </div>
                <button onclick="sendSingleBulkWhatsApp(${index}, '${waLink}')" class="${item.sent ? 'bg-gray-100 text-emerald-600 dark:bg-gray-700 hover:bg-gray-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg'} px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2">
                    <i data-lucide="${item.sent ? 'check-check' : 'send'}" class="w-4 h-4"></i>
                    ${item.sent ? 'مُرسل' : 'إرسال الآن'}
                </button>
            </div>
        `;
    });

    html += `</div>`;
    modal.innerHTML = html;
    lucide.createIcons();
    
    setTimeout(() => {
        const currentEl = modal.querySelector('.ring-4');
        if (currentEl) {
            currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function sendSingleBulkWhatsApp(index, url) {
    bulkWhatsAppQueue[index].sent = true;
    if (bulkWhatsAppCurrentIndex === index) {
        bulkWhatsAppCurrentIndex++;
        while (bulkWhatsAppCurrentIndex < bulkWhatsAppQueue.length && bulkWhatsAppQueue[bulkWhatsAppCurrentIndex].sent) {
            bulkWhatsAppCurrentIndex++;
        }
    }
    window.open(url, '_blank');
    renderBulkWhatsAppList();
}

// =====================================================
// FEATURE #12: Group PDF Reports with Date Filter (HTML2PDF)
// =====================================================
function openReportsModal() {
    let modal = document.getElementById('report-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    
    // Set default dates (last 7 days to today)
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="file-text" class="w-5 h-5 text-red-600"></i>
                    تصدير تقرير (PDF)
                </h3>
                <button onclick="closeModal('report-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">المسابقة</label>
                    <select id="report-comp-select" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3">
                        ${state.competitions.filter(c => !c.level || c.level === state.currentLevel).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">من تاريخ</label>
                        <input type="date" id="report-start-date" value="${startStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">إلى تاريخ</label>
                        <input type="date" id="report-end-date" value="${endStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('report-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button onclick="generatePDFReport()" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg transition flex justify-center items-center gap-2">
                        <i data-lucide="download" class="w-5 h-5"></i>
                        تحميل
                    </button>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    toggleModal('report-modal', true);
}

async function generatePDFReport() {
    const compId = $('#report-comp-select').value;
    const startDate = $('#report-start-date').value;
    const endDate = $('#report-end-date').value;
    const compName = $('#report-comp-select').options[$('#report-comp-select').selectedIndex].text;

    if (!compId || !startDate || !endDate) {
        showToast("الرجاء تحديد المسابقة والفترة كاملة", "error");
        return;
    }

    if (startDate > endDate) {
        showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");
        return;
    }

    // Generate date range
    const dateRange = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        dateRange.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
    }

    try {
        showToast("جاري إعداد التقرير...", "success");
        closeModal('report-modal');

        const groups = state.groups.filter(g => g.competitionId === compId && g.level === state.currentLevel);
        
        const sSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("competitionId", "==", compId)
            )
        );
        
        const gsSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "group_scores"),
                window.firebaseOps.where("competitionId", "==", compId)
            )
        ).catch(() => ({ forEach: () => {} }));

        const studentStatsMap = {};
        sSnap.forEach(d => {
            const sc = d.data();
            if (sc.date >= startDate && sc.date <= endDate) {
                if (!studentStatsMap[sc.studentId]) studentStatsMap[sc.studentId] = { points: 0, positive: 0, negative: 0, excused: 0, unexcused: 0 };
                const pts = parseFloat(sc.points) || 0;
                studentStatsMap[sc.studentId].points += pts;
                if (pts > 0) studentStatsMap[sc.studentId].positive += pts;
                else if (pts < 0) studentStatsMap[sc.studentId].negative += Math.abs(pts);
                
                const cName = sc.criteriaName || (sc.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : '');
                if (cName.indexOf('بعذر') !== -1) {
                    studentStatsMap[sc.studentId].excused++;
                } else if (cName.indexOf('بدون عذر') !== -1 || cName.indexOf('غياب') !== -1 || sc.criteriaId === 'ABSENCE_RECORD') {
                    studentStatsMap[sc.studentId].unexcused++;
                }
            }
        });

        const groupScoresMap = {};
        gsSnap.forEach(d => {
            const gs = d.data();
            if (gs.date >= startDate && gs.date <= endDate) {
                groupScoresMap[gs.groupId] = (groupScoresMap[gs.groupId] || 0) + (parseFloat(gs.points) || 0);
            }
        });

        // Create HTML content for the PDF
        const container = document.createElement('div');
        // A wrapper with guaranteed white background and fixed width suitable for A4 landscape
        container.innerHTML = `
            <div id="pdf-report-content" style="width: 1040px; padding: 30px; background: white; color: #1f2937; font-family: sans-serif; direction: rtl; text-align: right;">
                
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #064e3b; padding-bottom: 20px;">
                    <h1 style="font-size: 26px; color: #064e3b; margin: 0; font-weight: bold;">برنامج المتابعة</h1>
                    <h2 style="font-size: 20px; color: #374151; margin: 10px 0 5px 0;">تقرير المجموعات التفصيلي</h2>
                    <p style="font-size: 14px; color: #6b7280; margin: 0;">هذا التقرير الشامل يوضح درجات الطلاب في "${compName}" والمشاركات والغيابات مع حساب صافي النقاط للمجموعات بناءاً على إحصائيات هذه الفترة.</p>
                    <p style="font-size: 14px; color: #6b7280; margin: 5px 0 0 0;">الفترة المشمولة: من ${startDate} إلى ${endDate}</p>
                </div>

                ${groups.length === 0 ? '<p style="text-align: center; color: #9ca3af; font-size: 18px;">لا توجد مجموعات مسجلة.</p>' : ''}

                <div style="display: flex; flex-direction: column; gap: 30px;">
                    ${groups.map(g => {
                        const gBonus = groupScoresMap[g.id] || 0;
                        let membersSum = 0;
                        
                        let membersRows = '';
                        if (g.members && g.members.length > 0) {
                            membersRows = g.members.map((mId, idx) => {
                                const st = state.students.find(s => s.id === mId);
                                if (st) {
                                    const stats = studentStatsMap[mId] || { points: 0, positive: 0, negative: 0, excused: 0, unexcused: 0 };
                                    membersSum += stats.points;
                                    return `
                                        <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'};">
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${st.name}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${st.studentNumber || '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: bold;">${stats.unexcused > 0 ? stats.unexcused : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #d97706; font-weight: bold;">${stats.excused > 0 ? stats.excused : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #059669; font-weight: bold;" dir="ltr">${stats.positive > 0 ? '+' : ''}${stats.positive > 0 ? stats.positive : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: bold;" dir="ltr">${stats.negative > 0 ? '-' : ''}${stats.negative > 0 ? stats.negative : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${stats.points >= 0 ? '#059669' : '#dc2626'};" dir="ltr">${stats.points > 0 ? '+' : ''}${stats.points}</td>
                                        </tr>
                                    `;
                                }
                                return '';
                            }).join('');
                        } else {
                            membersRows = '<tr><td colspan="8" style="padding: 10px; text-align: center; color: #9ca3af; border: 1px solid #e5e7eb;">لا يوجد طلاب</td></tr>';
                        }

                        const netTotal = membersSum + gBonus;

                        return `
                        <div style="border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
                            <!-- Group Header -->
                            <div style="background: #f3f4f6; padding: 15px; border-bottom: 2px solid #9ca3af; display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 24px;">${g.icon && !isImgSrc(g.icon) ? g.icon : '🛡️'}</span>
                                    <h3 style="margin: 0; font-size: 20px; font-weight: bold;">${g.name}</h3>
                                </div>
                                <div style="font-size: 22px; font-weight: bold; color: ${netTotal >= 0 ? '#064e3b' : '#dc2626'};">
                                    الصافي: ${netTotal}
                                </div>
                            </div>
                            
                            <!-- Group Specific Score -->
                            ${gBonus !== 0 ? `
                            <div style="padding: 10px 15px; background: ${gBonus > 0 ? '#ecfdf5' : '#fef2f2'}; border-bottom: 1px solid #e5e7eb; border-left: 4px solid ${gBonus > 0 ? '#10b981' : '#ef4444'}; font-weight: bold; font-size: 14px; text-align: right; display: flex; justify-content: space-between;">
                                <span>النقاط الإضافية للمجموعة المستقلة:</span>
                                <span style="color: ${gBonus > 0 ? '#059669' : '#dc2626'};" dir="ltr">${gBonus > 0 ? '+' : ''}${gBonus}</span>
                            </div>
                            ` : ''}

                            <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 14px;">
                                <thead>
                                    <tr style="background: #e5e7eb;">
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 40px; text-align: center;">م</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db;">${state.currentLevel === 'ijazat' ? 'اسم الدارس' : 'اسم الطالب'}</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 140px; text-align: center;">${state.currentLevel === 'ijazat' ? 'رقم الجوال' : 'جوال ولي الأمر'}</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 50px; text-align: center; color: #b91c1c;">بدون عذر</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 50px; text-align: center; color: #d97706;">بعذر</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 60px; text-align: center; color: #047857;">موجب</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 60px; text-align: center; color: #b91c1c;">سالب</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 80px; text-align: center;">الصافي</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${membersRows}
                                    <tr style="background: #fdfce8;">
                                        <td colspan="7" style="padding: 10px; border: 1px solid #d1d5db; font-weight: bold; text-align: left;">مجموع نقاط الطلاب فقط:</td>
                                        <td style="padding: 10px; border: 1px solid #d1d5db; text-align: center; font-weight: bold; color: #b45309;">${membersSum}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        `;
                    }).join('')}
                </div>
                
                <div style="margin-top: 40px; text-align: left; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                    تم التوليد في: ${new Date().toLocaleString('ar-SA')}
                </div>
            </div>
        `;

        document.body.appendChild(container);
        const element = document.getElementById('pdf-report-content');

        // html2pdf options (Landscape)
        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `تقرير_${compName}_${startDate}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await window.html2pdf().set(opt).from(element).save();
        document.body.removeChild(container);

        showToast("تم تحميل التقرير بنجاح", "success");
    } catch (e) {
        console.error("PDF Generate Error:", e);
        showToast("حدث خطأ أثناء إعداد التقرير", "error");
    }
}

// =====================================================
// FEATURE #13: PDF Exports & Advanced Stats
// =====================================================
async function exportStudentsPDF() {
    const students = state.students.filter(s => s.level === state.currentLevel);
    if (students.length === 0) {
        showToast("لا يوجد طلاب للتصدير", "error");
        return;
    }

    try {
        showToast("جاري التجهيز... الرجاء الانتظار", "success");

        const grouped = {};
        const activeGroups = state.groups.filter(g => g.level === state.currentLevel);
        
        activeGroups.forEach(g => {
            grouped[g.id] = { name: g.name, students: [] };
        });

        students.forEach(s => {
            if (s.groupId && grouped[s.groupId]) {
                grouped[s.groupId].students.push(s);
            } else {
                if (!grouped['none']) grouped['none'] = { name: 'بدون مجموعة', students: [] };
                grouped['none'].students.push(s);
            }
        });

        const levelName = state.levels.find(l => l.id === state.currentLevel)?.name || state.currentLevel;

        const container = document.createElement('div');
        container.innerHTML = `
            <div id="pdf-students-content" style="width: 1040px; padding: 30px; background: white; color: #1f2937; font-family: sans-serif; direction: rtl; text-align: right;">
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #064e3b; padding-bottom: 20px;">
                    <h1 style="font-size: 26px; color: #064e3b; margin: 0; font-weight: bold;">برنامج المتابعة</h1>
                    <h2 style="font-size: 20px; color: #374151; margin: 10px 0 5px 0;">سجل بيانات الطلاب الشامل</h2>
                    <p style="font-size: 14px; color: #6b7280; margin: 0;">المستوى: ${levelName} | إجمالي الطلاب: ${students.length}</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 30px;">
                    ${Object.values(grouped).filter(g => g.students.length > 0).map(g => `
                        <div style="border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
                            <div style="background: #f3f4f6; padding: 15px; border-bottom: 2px solid #9ca3af; display: flex; justify-content: space-between; align-items: center;">
                                <h3 style="margin: 0; font-size: 20px; font-weight: bold;">مجموعة: ${g.name}</h3>
                                <div style="font-size: 16px; font-weight: bold; color: #064e3b;">العدد: ${g.students.length}</div>
                            </div>
                            <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 14px;">
                                <thead>
                                    <tr style="background: #e5e7eb;">
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 50px; text-align: center;">م</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db;">اسم الطالب</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 140px; text-align: center;">رقم الهوية / الجوال</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 100px; text-align: center;">آخر تفاعل</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db;">كلمة المرور</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${g.students.map((st, idx) => `
                                        <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'};">
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${st.name}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${st.studentNumber || '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${st.lastActive ? new Date(st.lastActive).toLocaleDateString() : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626;" dir="ltr">${st.password || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 40px; text-align: left; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                    تم التوليد في: ${new Date().toLocaleString('ar-SA')}
                </div>
            </div>
        `;

        document.body.appendChild(container);
        const element = document.getElementById('pdf-students-content');

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `الطلاب_${levelName}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await window.html2pdf().set(opt).from(element).save();
        document.body.removeChild(container);

        showToast("تم تصدير كشف الطلاب بنجاح", "success");
    } catch(e) {
        console.error(e);
        showToast("خطأ أثناء إعداد الكشف", "error");
    }
}

function openScoresReportsModal() {
    let modal = document.getElementById('scores-report-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'scores-report-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[160] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="file-spreadsheet" class="w-5 h-5 text-emerald-600"></i>
                    سجل الدرجات الشامل (PDF)
                </h3>
                <button onclick="closeModal('scores-report-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">من تاريخ</label>
                        <input type="date" id="score-report-start-date" value="${startStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">إلى تاريخ</label>
                        <input type="date" id="score-report-end-date" value="${endStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('scores-report-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button onclick="exportScoresPDF()" class="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg transition flex justify-center items-center gap-2">
                        <i data-lucide="download" class="w-5 h-5"></i>
                        تحميل سجل مفصل
                    </button>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    toggleModal('scores-report-modal', true);
}

async function exportScoresPDF() {
    const startDate = document.getElementById('score-report-start-date').value;
    const endDate = document.getElementById('score-report-end-date').value;

    if (!startDate || !endDate) return showToast("الرجاء تحديد الفترة", "error");
    if (startDate > endDate) return showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");

    const dateRange = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        dateRange.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
    }

    try {
        showToast("جاري إعداد السجل...", "success");
        closeModal('scores-report-modal');

        const students = state.students.filter(s => s.level === state.currentLevel);
        const levelName = state.levels.find(l => l.id === state.currentLevel)?.name || state.currentLevel;

        const sSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("date", ">=", startDate),
                window.firebaseOps.where("date", "<=", endDate)
            )
        );

        const logs = [];
        sSnap.forEach(d => {
            const row = d.data();
            const student = students.find(s => s.id === row.studentId);
            if (student) {
                logs.push({ ...row, studentName: student.name, group: state.groups.find(g => g.id === student.groupId)?.name || '-' });
            }
        });

        logs.sort((a, b) => new Date(a.date) - new Date(b.date) || a.studentName.localeCompare(b.studentName));

        const container = document.createElement('div');
        let tableRows = '';
        
        if (logs.length === 0) {
            tableRows = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #9ca3af; border: 1px solid #e5e7eb;">لا توجد درجات مسجلة في هذه الفترة</td></tr>';
        } else {
            tableRows = logs.map((log, idx) => `
                <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'};">
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${log.date}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">${log.studentName}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; color: #4b5563;">${log.group}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${log.points >= 0 ? '#059669' : '#dc2626'};" dir="ltr">${log.points > 0 ? '+' : ''}${log.points}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${log.criteriaName || (log.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : 'أخرى')}</td>
                </tr>
            `).join('');
        }

        container.innerHTML = `
            <div id="pdf-scores-content" style="width: 1040px; padding: 30px; background: white; color: #1f2937; font-family: sans-serif; direction: rtl; text-align: right;">
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #064e3b; padding-bottom: 20px;">
                    <h1 style="font-size: 26px; color: #064e3b; margin: 0; font-weight: bold;">برنامج المتابعة</h1>
                    <h2 style="font-size: 20px; color: #374151; margin: 10px 0 5px 0;">السجل التفصيلي للدرجات والمشاركات</h2>
                    <p style="font-size: 14px; color: #6b7280; margin: 0;">المستوى: ${levelName} | الفترة: ${startDate} إلى ${endDate} | عدد الحركات: ${logs.length}</p>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 13px;">
                    <thead>
                        <tr style="background: #e5e7eb;">
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 40px; text-align: center;">م</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 100px; text-align: center;">التاريخ</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 220px;">اسم الطالب</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 160px;">المجموعة</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 60px; text-align: center;">النقاط</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db;">المعيار / السبب</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
                <div style="margin-top: 40px; text-align: left; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                    تم التوليد في: ${new Date().toLocaleString('ar-SA')}
                </div>
            </div>
        `;

        document.body.appendChild(container);
        const element = document.getElementById('pdf-scores-content');

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `سجل_الدرجات_${startDate}_${endDate}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await window.html2pdf().set(opt).from(element).save();
        document.body.removeChild(container);

        showToast("تم تصدير سجل الدرجات بنجاح", "success");
    } catch(e) {
        console.error(e);
        showToast("خطأ أثناء إعداد التصدير", "error");
    }
}

// ----------------------------------------
// STATS MODAL (Advanced)
// ----------------------------------------
function openStatsModal() {
    let modal = document.getElementById('stats-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stats-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 30);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="bar-chart-3" class="w-6 h-6 text-amber-600"></i>
                    المركز التحليلي والإحصائيات
                </h3>
                <button onclick="closeModal('stats-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <!-- Date Filter & Group Filter -->
            <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl flex flex-wrap gap-3 mb-6 items-end">
                <div class="flex-1 min-w-[120px]">
                    <label class="block text-xs font-bold mb-1 text-gray-500">من تاريخ</label>
                    <input type="date" id="stats-start-date" value="${startStr}" class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="flex-1 min-w-[120px]">
                    <label class="block text-xs font-bold mb-1 text-gray-500">إلى تاريخ</label>
                    <input type="date" id="stats-end-date" value="${endStr}" class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="flex-1 min-w-[150px]">
                    <label class="block text-xs font-bold mb-1 text-gray-500">المجموعة</label>
                    <select id="stats-group-select" class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                        <option value="all">جميع المجموعات (عام)</option>
                        ${state.groups.filter(g => g.level === state.currentLevel).map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                    </select>
                </div>
                <button onclick="calculateAndRenderStats()" class="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition h-[38px] flex items-center shadow-sm">
                    تحديث القراءة
                </button>
            </div>

            <div id="stats-results-container" class="overflow-y-auto space-y-4 pb-4">
                <div class="text-center py-10 text-gray-400">
                    <i data-lucide="loader-2" class="w-8 h-8 mx-auto mb-2 animate-spin"></i>
                    جاري حساب البيانات...
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    toggleModal('stats-modal', true);
    
    // Automatically calculate stats on open
    setTimeout(() => { calculateAndRenderStats(); }, 100);
}

async function calculateAndRenderStats() {
    const startDate = document.getElementById('stats-start-date').value;
    const endDate = document.getElementById('stats-end-date').value;
    const groupId = document.getElementById('stats-group-select') ? document.getElementById('stats-group-select').value : 'all';
    const container = document.getElementById('stats-results-container');

    if (!startDate || !endDate) return showToast("الرجاء تحديد التواريخ", "error");

    const dateRange = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        dateRange.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
    }

    try {
        container.innerHTML = `<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 mx-auto mb-2 animate-spin"></i> استخراج البيانات...</div>`;
        lucide.createIcons();

        // 1. Fetch Students
        let students = state.students.filter(s => s.level === state.currentLevel);
        if (groupId !== 'all') {
            students = students.filter(s => String(s.groupId) === String(groupId));
        }
        const stIds = students.map(s => s.id);
        
        if (stIds.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-400 p-8 border border-dashed rounded-xl border-gray-200">لا يوجد طلاب مطابقين للبحث.</div>`;
            return;
        }

        // 2. Fetch Scores for Date Range
        const sSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("date", ">=", startDate),
                window.firebaseOps.where("date", "<=", endDate)
            )
        );

        let totalScoresRows = 0;
        let posPoints = 0;
        let negPoints = 0;
        let absencesCount = 0;
        let excusesCount = 0;
        let criteriaUsage = {};

        sSnap.forEach(d => {
            const sc = d.data();
            // Only count if student is in the current level
            if (stIds.includes(sc.studentId)) {
                totalScoresRows++;
                const pts = parseFloat(sc.points) || 0;
                
                if (pts > 0) posPoints += pts;
                else if (pts < 0) negPoints += Math.abs(pts);

                const cName = sc.criteriaName || (sc.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : 'عام');
                
                if (cName.indexOf('بدون عذر') !== -1 || sc.criteriaId === 'ABSENCE_RECORD') absencesCount++;
                if (cName.indexOf('بعذر') !== -1) excusesCount++;

                if (!criteriaUsage[cName]) criteriaUsage[cName] = { count: 0, points: 0 };
                criteriaUsage[cName].count++;
                criteriaUsage[cName].points += pts;
            }
        });

        // HTML Setup
        const sortedCriteria = Object.entries(criteriaUsage).sort((a, b) => b[1].count - a[1].count);

        container.innerHTML = `
            <!-- Overview Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-emerald-600 mb-1">${totalScoresRows}</p>
                    <p class="text-xs text-emerald-800 dark:text-emerald-300">إجمالي الحركات (تقييمات)</p>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-green-600 mb-1">+${posPoints}</p>
                    <p class="text-xs text-green-800 dark:text-green-300">مجموع النقاط المكتسبة</p>
                </div>
                <div class="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-red-600 mb-1">-${negPoints}</p>
                    <p class="text-xs text-red-800 dark:text-red-300">مجموع الخصومات</p>
                </div>
                <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-orange-600 mb-1">${absencesCount}</p>
                    <p class="text-xs text-orange-800 dark:text-orange-300">إجمالي أيام الغياب</p>
                </div>
            </div>

            <!-- Details Section -->
            <div class="mt-6 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                <div class="bg-gray-50 dark:bg-gray-800 p-3 border-b border-gray-100 dark:border-gray-700">
                    <h4 class="font-bold text-sm flex items-center gap-2"><i data-lucide="bar-chart" class="w-4 h-4 text-amber-500"></i> تفصيل تفاعل المعايير خلال الفترة</h4>
                </div>
                <div class="p-0">
                    <table class="w-full text-right text-sm">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th class="p-3 font-medium">اسم المعيار</th>
                                <th class="p-3 font-medium text-center">مرات الاستخدام</th>
                                <th class="p-3 font-medium text-center">صافي النقاط</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                            ${sortedCriteria.length > 0 ? sortedCriteria.map(([name, data]) => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <td class="p-3 font-bold">${name}</td>
                                    <td class="p-3 text-center"><span class="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 py-1 px-3 rounded-full text-xs font-bold">${data.count}</span></td>
                                    <td class="p-3 text-center font-bold ${data.points >= 0 ? 'text-green-600' : 'text-red-600'}" dir="ltr">${data.points > 0 ? '+' : ''}${data.points}</td>
                                </tr>
                            `).join('') : `<tr><td colspan="3" class="p-6 text-center text-gray-400">لا يوجد حركات في هذه الفترة</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        lucide.createIcons();

    } catch (e) {
        console.error("Stats Error:", e);
        container.innerHTML = `<div class="text-center py-6 text-red-500">حدث خطأ أثناء الاتصال بقاعدة البيانات. تأكد من استقرار الإنترنت.</div>`;
    }
}

// Auto-load Quran data on start
if (window.QuranService) {
    window.QuranService.loadData().catch(console.error);
}

// =====================================================
// === نظام النسخ الاحتياطي التلقائي الأسبوعي ===
// =====================================================

async function checkAndCreateWeeklyBackup() {
    if (!state.isTeacher || !state.currentLevel) return;

    try {
        // جلب آخر نسخة لهذه الحلقة
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, 'backups'),
            window.firebaseOps.where('level', '==', state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);

        let lastBackup = null;
        snap.forEach(doc => {
            const d = doc.data();
            const t = d.createdAt ? new Date(d.createdAt).getTime() : 0;
            if (!lastBackup || t > new Date(lastBackup.createdAt).getTime()) {
                lastBackup = d;
            }
        });

        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        let needsBackup = true;

        if (lastBackup && lastBackup.createdAt) {
            const lastTime = new Date(lastBackup.createdAt).getTime();
            if (now - lastTime < sevenDaysMs) {
                needsBackup = false;
            }
        }

        if (needsBackup) {
            await performWeeklyBackup(!lastBackup);
        }

    } catch (e) {
        console.error('⚠️ فحص النسخة الاحتياطية فشل:', e);
    }
}

async function performWeeklyBackup(isFirst = false) {
    try {
        // جمع كل بيانات الحلقة بصمت
        const [studentsSnap, scoresSnap, competitionsSnap, groupsSnap] = await Promise.all([
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, 'students'),
                window.firebaseOps.where('level', '==', state.currentLevel)
            )),
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, 'scores'),
                window.firebaseOps.where('level', '==', state.currentLevel)
            )),
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, 'competitions'),
                window.firebaseOps.where('level', '==', state.currentLevel)
            )),
            window.firebaseOps.getDocs(window.firebaseOps.query(
                window.firebaseOps.collection(window.db, 'groups'),
                window.firebaseOps.where('level', '==', state.currentLevel)
            ))
        ]);

        const students = [];
        studentsSnap.forEach(doc => { const d = doc.data(); d.id = doc.id; students.push(d); });

        const scores = [];
        scoresSnap.forEach(doc => { const d = doc.data(); d.id = doc.id; scores.push(d); });

        const competitions = [];
        competitionsSnap.forEach(doc => { const d = doc.data(); d.id = doc.id; competitions.push(d); });

        const groups = [];
        groupsSnap.forEach(doc => { const d = doc.data(); d.id = doc.id; groups.push(d); });

        const backupData = {
            students,
            scores,
            competitions,
            groups,
            backupDate: new Date().toISOString(),
            studentCount: students.length,
            scoresCount: scores.length
        };

        // حفظ في جدول backups بصمت
        await window.firebaseOps.addDoc(
            window.firebaseOps.collection(window.db, 'backups'),
            {
                level: state.currentLevel,
                backupData: backupData,
                createdAt: new Date()
            }
        );

    } catch (e) {
        console.error('❌ فشل حفظ النسخة الاحتياطية:', e);
    }
}

// نسخة احتياطية يدوية صامتة (متاحة من الكونسول فقط)
window.manualBackup = async function() {
    if (!state.isTeacher) return;
    await performWeeklyBackup(false);
};

// =========================================
// واجهة الرصد المباشر (Direct Grading Board)
// =========================================
function renderDirectGrading() {
    const container = $('#view-container');
    
    if (!state.enableDirectGrading) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-gray-400">
                <i data-lucide="lock" class="w-12 h-12 mb-3"></i>
                <p>ميزة الرصد المباشر معطلة للحلقة الحالية</p>
                <p class="text-xs mt-2">يمكن للمعلم تفعيلها من الإعدادات</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">الرصد المباشر - ${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</h2>
                <button onclick="openCollectiveNoteModal()" class="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/60 px-3 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1 border border-purple-200 dark:border-purple-800">
                    <i data-lucide="message-square" class="w-4 h-4"></i>
                    ملاحظة جماعية
                </button>
            </div>
            
            <div class="relative mb-4">
                <i data-lucide="search" class="w-5 h-5 absolute right-3 top-3 text-gray-400"></i>
                <input type="text" id="direct-student-search" placeholder="ابحث عن ${getLabel('student')}..." class="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl py-3 pr-10 pl-4 focus:outline-none focus:border-emerald-500 transition" onkeyup="filterDirectStudents()">
            </div>

            <div id="direct-students-list" class="space-y-2 pb-24">
                <!-- Students injected here -->
            </div>
        </div>
    `;

    updateDirectStudentsList();
    lucide.createIcons();
}

function updateDirectStudentsList() {
    const list = $('#direct-students-list');
    if (!list) return;

    if (state.students.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 py-8">لا يوجد طلاب مسجلين</p>';
        return;
    }

    // Sort students alphabetically
    const sorted = [...state.students].sort((a, b) => a.name.localeCompare(b.name));

    list.innerHTML = sorted.map(student => {
        const iconHtml = isImgSrc(student.icon) 
            ? `<div class="w-10 h-10 rounded-full overflow-hidden border border-gray-200 shrink-0"><img src="${student.icon}" class="w-full h-full object-cover"></div>`
            : `<div class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xl shrink-0 border border-emerald-200 dark:border-emerald-800">${student.icon || '👤'}</div>`;

        return `
            <div class="direct-student-item flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-emerald-500 transition" onclick="openDirectGradingStudent('${student.id}')" data-name="${student.name}">
                ${iconHtml}
                <div class="flex-1">
                    <p class="font-bold text-sm text-gray-900 dark:text-gray-100">${student.name}</p>
                </div>
                <i data-lucide="chevron-left" class="w-5 h-5 text-gray-400"></i>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

window.filterDirectStudents = function() {
    const q = document.getElementById('direct-student-search').value.toLowerCase();
    const items = document.querySelectorAll('.direct-student-item');
    items.forEach(item => {
        if (item.dataset.name.toLowerCase().includes(q)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
};

function openDirectGradingStudent(studentId) {
    ensureRateStudentModal();
    currentRateStudentId = studentId;
    // Set a dummy competition ID so existing functions work but save isolated
    currentGradingCompId = 'DIRECT_GRADING';
    currentGradingGroupId = null; // Independent of groups
    
    const s = state.students.find(x => x.id === studentId);
    $('#rate-student-name').textContent = s ? s.name : `تقييم ${getLabel('student')}`;
    
    // Set Date
    if (document.getElementById('modal-grading-date')) {
        document.getElementById('modal-grading-date').value = new Date().toISOString().split('T')[0];
    }
    
    // Handle Ijazat Note visibility
    const visSelect = document.getElementById('rate-note-visibility');
    if (visSelect) {
        if (state.currentLevel === 'ijazat') {
            visSelect.value = 'student'; // Always to student
            visSelect.classList.add('hidden'); // Hide it completely
        } else {
            visSelect.classList.remove('hidden');
        }
    }

    if(document.getElementById('rate-note-text')) document.getElementById('rate-note-text').value = '';
    
    // Show quran section
    const quranSec = document.getElementById('rate-quran-section');
    if (quranSec) {
        quranSec.classList.remove('hidden');
        const startSuraMemorization = document.getElementById('rate-quran-start-sura-memorization');
        if (startSuraMemorization && startSuraMemorization.options.length <= 1) {
            const suras = window.QuranService.getSuras();
            const optionsHtml = suras.map(sur => `<option value="${sur.number}">${sur.name}</option>`).join('');
            ['memorization', 'review'].forEach(type => {
                const sSura = document.getElementById(`rate-quran-start-sura-${type}`);
                const eSura = document.getElementById(`rate-quran-end-sura-${type}`);
                if(sSura) sSura.innerHTML = `<option value="">السورة..</option>` + optionsHtml;
                if(eSura) eSura.innerHTML = `<option value="">السورة..</option>` + optionsHtml;
            });
        }
        ['memorization', 'review'].forEach(type => {
            const startS = document.getElementById(`rate-quran-start-sura-${type}`);
            const endS = document.getElementById(`rate-quran-end-sura-${type}`);
            if(startS) startS.value = "";
            if(endS) endS.value = "";
            const startA = document.getElementById(`rate-quran-start-aya-${type}`);
            if(startA) { startA.innerHTML = '<option value="">الآية..</option>'; startA.disabled = true; }
            const endA = document.getElementById(`rate-quran-end-aya-${type}`);
            if(endA) { endA.innerHTML = '<option value="">الآية..</option>'; endA.disabled = true; }
            const gradeEl = document.getElementById(`rate-quran-grade-${type}`);
            if(gradeEl) gradeEl.value = "";
        });
    }

    // Always use today for Direct Grading unless specified
    const todayStr = new Date().toLocaleDateString('en-CA');

    const grid = $('#criteria-buttons-grid');
    grid.innerHTML = `
        <div class="col-span-1 grid grid-cols-1 gap-3 w-full mb-3">
            <button onclick="openAbsenceOptions()" class="bg-orange-50 text-orange-700 border border-orange-200 py-3 rounded-xl font-bold hover:bg-orange-100 transition flex items-center justify-center gap-2">
                <i data-lucide="user-x" class="w-4 h-4"></i>
                <span>تسجيل غياب</span>
            </button>
            <button onclick="openTransferStudent('${studentId}')" class="bg-purple-50 text-purple-700 border border-purple-200 py-3 rounded-xl font-bold hover:bg-purple-100 transition flex items-center justify-center gap-2">
                <i data-lucide="arrow-right-left" class="w-4 h-4"></i>
                <span>نقل ${getLabel('student')}</span>
            </button>
        </div>
    `;

    toggleModal('rate-student-modal', true);
    lucide.createIcons();

    // Load plan tracking for direct grading
    const _dgPlanDate = new Date().toLocaleDateString('en-CA');
    if (typeof loadPlanTrackingForStudent === 'function') {
        loadPlanTrackingForStudent(studentId, _dgPlanDate);
    }
}

// Override openAbsenceOptions to check plan FIRST, then handle DIRECT_GRADING vs competition
const _originalOpenAbsenceBase = window.openAbsenceOptions;

function _doOpenAbsenceModal() {
    if (currentGradingCompId === 'DIRECT_GRADING') {
        let modal = document.getElementById('absence-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'absence-modal';
            modal.className = 'fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                <div class="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600 dark:text-orange-400">
                    <i data-lucide="user-x" class="w-8 h-8"></i>
                </div>
                <h3 class="font-bold text-lg mb-2">تسجيل غياب مباشر</h3>
                <p class="text-sm text-gray-500 mb-6">سيتم تسجيل الغياب بدون درجات خصم.</p>
                <div class="space-y-3">
                    <button onclick="submitAbsence('بعذر', 0)" class="w-full py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-bold rounded-xl transition">غياب بعذر</button>
                    <button onclick="submitAbsence('بدون عذر', 0)" class="w-full py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl transition">غياب بدون عذر</button>
                    <button onclick="closeModal('absence-modal')" class="w-full py-2 text-gray-400 hover:text-gray-600 mt-2 text-sm font-bold">إلغاء</button>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        lucide.createIcons();
    } else {
        if (_originalOpenAbsenceBase) _originalOpenAbsenceBase();
    }
}

const originalOpenAbsenceOptions = window.openAbsenceOptions;
window.openAbsenceOptions = function() {
    const _absDate = document.getElementById('modal-grading-date')?.value || new Date().toLocaleDateString('en-CA');
    if (currentRateStudentId && typeof checkPlanBeforeAbsence === 'function') {
        checkPlanBeforeAbsence(currentRateStudentId, _absDate, _doOpenAbsenceModal);
    } else {
        _doOpenAbsenceModal();
    }
};

async function submitAbsence(label, points) {
    if (!currentRateStudentId) {
        showToast("خطأ: لم يتم تحديد الطالب", "error");
        return;
    }

    try {
        const student = state.students.find(s => s.id === currentRateStudentId);
        const dateVal = document.getElementById('modal-grading-date') ? document.getElementById('modal-grading-date').value : new Date().toISOString().split('T')[0];

        // 1. Save to DB
        const scoreData = {
            studentId: currentRateStudentId,
            competitionId: currentGradingCompId === 'DIRECT_GRADING' ? null : currentGradingCompId,
            groupId: currentGradingGroupId || null,
            criteriaId: 'ABSENCE_RECORD',
            criteriaName: 'غياب (' + label + ')',
            points: points || 0,
            type: 'negative',
            level: state.currentLevel,
            date: dateVal,
            updatedAt: new Date().toISOString(),
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };

        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), scoreData);
        
        // 2. WhatsApp Notification
        if (student && student.studentNumber) {
            const phone = student.studentNumber;
            const msg = state.currentLevel === 'ijazat' 
                ? `السلام عليكم يا أخي ${student.name}،\nتم تسجيل غياب لك اليوم (${label}).\nنرجو الحرص على الحضور والمتابعة.`
                : `السلام عليكم ولي أمر الطالب ${student.name}،\nتم تسجيل غياب للطالب اليوم (${label}).\nنرجو الحرص على الحضور.`;

            const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
            window.open(url, '_blank');
        }

        showToast("تم تسجيل الغياب بنجاح");
        closeModal('absence-modal');
        closeModal('rate-student-modal');

    } catch (e) {
        console.error("Error submitting absence:", e);
        showToast("حدث خطأ أثناء تسجيل الغياب", "error");
    }
}

// Also ensure submitScore can accept 0 points specifically for direct grading
// We don't need to change submitScore itself since parseInt(0) === 0

// =========================================
// تسجيل الطالب الذاتي (Self-Registration)
// =========================================
function openRegistrationLinkModal() {
    if (!state.currentLevel) return;
    const url = window.location.origin + window.location.pathname + '?register=1&level=' + encodeURIComponent(state.currentLevel);
    
    // Set URL
    const displayEl = document.getElementById('registration-link-display');
    if (displayEl) {
        displayEl.textContent = url;
    }
    
    // Set Copy action
    const copyBtn = document.getElementById('copy-registration-link-btn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(url).then(() => {
                showToast('تم نسخ الرابط بنجاح! 📋');
                closeModal('registration-link-modal');
            });
        };
    }
    
    toggleModal('registration-link-modal', true);
    lucide.createIcons();
}

function ensureRateStudentModal() {
    if (document.getElementById('rate-student-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'rate-student-modal';
    modal.className = 'fixed inset-0 bg-black/60 z-[400] hidden flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 shrink-0">
                <h3 id="rate-student-name" class="font-bold text-lg">اسم ${getLabel('student')}</h3>
                <button onclick="closeModal('rate-student-modal')"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            
            <div class="p-6 overflow-y-auto flex-1">
                <p id="rate-date-display" class="text-xs text-gray-500 text-center mb-2 font-bold"></p>
                
                <div id="rate-quran-section" class="hidden mb-4 space-y-4">
                    <!-- Hifz Box -->
                    <div id="rate-quran-hifz-box" class="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 text-right space-y-3 shadow-sm">
                        <h4 class="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">📝 تسجيل حفظ أو مراجعة صغرى</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">من سورة</p>
                                <select id="rate-quran-start-sura-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('start', 'memorization')">
                                    <option value="">السورة..</option>
                                </select>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">من آية</p>
                                <select id="rate-quran-start-aya-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                    <option value="">الآية..</option>
                                </select>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">إلى سورة</p>
                                <select id="rate-quran-end-sura-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('end', 'memorization')">
                                    <option value="">السورة..</option>
                                </select>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">إلى آية</p>
                                <select id="rate-quran-end-aya-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                    <option value="">الآية..</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <p class="text-[10px] font-bold text-gray-500 mb-1">التقدير</p>
                            <select id="rate-quran-grade-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold">
                                <option value="">اختر التقدير..</option>
                                <option value="ممتاز">⭐ ممتاز</option>
                                <option value="جيد جداً">✨ جيد جداً</option>
                                <option value="مقبول">👍 مقبول</option>
                                <option value="سيء">⚠️ سيء</option>
                                <option value="لم يحفظ">❌ لم يحفظ</option>
                            </select>
                        </div>
                        <button onclick="submitQuranRecord('memorization')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2">
                            <i data-lucide="save" class="w-4 h-4"></i>حفظ المقطع
                        </button>
                    </div>

                    <!-- Murajaa Box -->
                    <div id="rate-quran-review-box" class="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 text-right space-y-3 shadow-sm">
                        <h4 class="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">🔄 تسجيل مراجعة أو مراجعة كبرى</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">من سورة</p>
                                <select id="rate-quran-start-sura-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('start', 'review')">
                                    <option value="">السورة..</option>
                                </select>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">من آية</p>
                                <select id="rate-quran-start-aya-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                    <option value="">الآية..</option>
                                </select>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">إلى سورة</p>
                                <select id="rate-quran-end-sura-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('end', 'review')">
                                    <option value="">السورة..</option>
                                </select>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 mb-1">إلى آية</p>
                                <select id="rate-quran-end-aya-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                    <option value="">الآية..</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <p class="text-[10px] font-bold text-gray-500 mb-1">التقدير</p>
                            <select id="rate-quran-grade-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold">
                                <option value="">اختر التقدير..</option>
                                <option value="ممتاز">⭐ ممتاز</option>
                                <option value="جيد جداً">✨ جيد جداً</option>
                                <option value="مقبول">👍 مقبول</option>
                                <option value="سيء">⚠️ سيء</option>
                                <option value="لم يراجع">❌ لم يراجع</option>
                            </select>
                        </div>
                        <button onclick="submitQuranRecord('review')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2">
                            <i data-lucide="save" class="w-4 h-4"></i>حفظ المراجعة
                        </button>
                    </div>
                </div>                     
                <div id="rate-quran-plan-display" class="hidden mb-3 text-sm text-center bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-2 rounded-lg font-bold text-emerald-800 dark:text-emerald-400"></div>

                <div class="mb-4 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">📅 تاريخ الرصد</label>
                    <input type="date" id="modal-grading-date" onchange="if(typeof loadPlanTrackingForStudent === 'function' && window.currentRateStudentId) loadPlanTrackingForStudent(window.currentRateStudentId, this.value)" class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-700 dark:text-gray-200 outline-none focus:border-emerald-500 transition">
                </div>
                
                <!-- Note Box -->
                <div class="mb-4 bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800 text-right space-y-3 shadow-sm">
                    <h4 class="font-bold text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">📝 إرسال ملاحظة نصية</h4>
                    <textarea id="rate-note-text" rows="2" class="w-full bg-white dark:bg-gray-700 border border-yellow-200 rounded-lg px-2 py-2 text-xs" placeholder="اكتب الملاحظة هنا..."></textarea>
                    <div class="space-y-2">
                        <select id="rate-note-visibility" class="w-full bg-white dark:bg-gray-700 border border-yellow-200 rounded-lg px-2 py-2 text-xs font-bold text-gray-600">
                            <option value="both">${state.currentLevel === 'ijazat' ? 'للجميع' : 'للطالب وولي الأمر'}</option>
                            <option value="student">${state.currentLevel === 'ijazat' ? 'خاص بي فقط' : 'للطالب فقط'}</option>
                            <option value="parent">${state.currentLevel === 'ijazat' ? 'للآخرين فقط' : 'لولي الأمر فقط'}</option>
                        </select>
                        <button onclick="submitNote()" class="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm">
                            <i data-lucide="send" class="w-4 h-4"></i> إرسال الملاحظة
                        </button>
                    </div>
                </div>

                <div id="criteria-buttons-grid" class="grid grid-cols-1 gap-3"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function submitStudentSelfRegistration() {
    const level = window._selfRegistrationLevel;
    if (!level || !LEVELS[level]) {
        showToast("خطأ في تحديد الحلقة", "error");
        return;
    }

    const name = $('#self-reg-name').value.trim();
    const idNum = $('#self-reg-id').value.trim();
    const phoneInput = $('#self-reg-phone').value.trim();
    const password = $('#self-reg-password').value;
    const lastAssoc = $('#self-reg-last-test').value.trim();
    const icon = window._selectedAddStudentIcon || '👤';

    if (!name || !idNum || !phoneInput || !password) {
        showToast("الرجاء تعبئة جميع الحقول وإدخال كلمة المرور", "error");
        return;
    }

    const phone = normalizePhone(phoneInput);
    if (!phone || phone.length < 9) {
        showToast("الرجاء إدخال رقم جوال صحيح", "error");
        return;
    }

    try {
        const loadingBtn = $('#self-reg-submit-btn');
        loadingBtn.disabled = true;
        loadingBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> جاري التسجيل...';

        const data = {
            name: name,
            studentNumber: phone,
            national_id: idNum,
            parentPhone: phone,
            password: password,
            last_association_exam: lastAssoc,
            level: level,
            icon: icon,
            createdAt: new Date().toISOString()
        };

        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "students"), data);
        
        showToast("تم تسجيلك بنجاح! 🎉");
        
        // Remove URL params and show login
        history.replaceState(null, '', window.location.pathname);
        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (e) {
        console.error("Error registering student:", e);
        showToast("خطأ أثناء التسجيل، يرجى المحاولة لاحقاً", "error");
        $('#self-reg-submit-btn').disabled = false;
        $('#self-reg-submit-btn').textContent = 'إتمام التسجيل';
    }
}

// =========================================
// الملاحظات الجماعية (Collective Notes)
// =========================================
function openCollectiveNoteModal() {
    const d = new Date();
    // Default to today in YYYY-MM-DD local time
    $('#collective-note-date').value = d.toLocaleDateString('en-CA');
    $('#collective-note-text').value = '';
    
    // Auto-hide visibility options for ijazat adult circles
    const visibilityContainer = $('#collective-note-visibility-container');
    if (visibilityContainer) {
        if (state.currentLevel === 'ijazat') {
            visibilityContainer.style.display = 'none';
            $('#collective-note-visibility').value = 'student'; // Force student only
        } else {
            visibilityContainer.style.display = 'block';
            $('#collective-note-visibility').value = 'student'; // Default
        }
    }

    // Reset Target Selection
    const targetAll = document.querySelector('input[name="collective-note-target"][value="all"]');
    if(targetAll) targetAll.checked = true;
    toggleCollectiveNoteTarget();

    // Populate students list for checkboxes
    const studentsContainer = $('#collective-note-students-list');
    if (studentsContainer && state.students) {
        // Filter students by current competition level if inside a competition
        let targetStudents = state.students;
        const comp = state.competitions.find(c => c.id === currentManageCompId);
        if (state.currentView === 'manage_competition_scores' && comp) {
            targetStudents = state.students.filter(s => s.level === comp.level);
        } else if (state.currentView === 'direct_grading') {
            targetStudents = state.students.filter(s => s.level === state.currentLevel);
        }

        studentsContainer.innerHTML = targetStudents.map(s => `
            <label class="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer transition">
                <input type="checkbox" value="${s.id}" class="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 collective-note-student-cb">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">${s.name}</span>
            </label>
        `).join('');
    }

    toggleModal('collective-note-modal', true);
}

function toggleCollectiveNoteTarget() {
    const targetType = document.querySelector('input[name="collective-note-target"]:checked')?.value || 'all';
    const studentsContainer = $('#collective-note-students-container');
    if(studentsContainer) {
        if (targetType === 'specific') {
            studentsContainer.style.display = 'block';
        } else {
            studentsContainer.style.display = 'none';
        }
    }
}

async function submitCollectiveNote() {
    const dateVal = $('#collective-note-date').value;
    const noteText = $('#collective-note-text').value.trim();
    const visibility = $('#collective-note-visibility').value;
    const targetType = document.querySelector('input[name="collective-note-target"]:checked')?.value || 'all';

    if (!dateVal) {
        showToast("يرجى اختيار التاريخ", "error");
        return;
    }
    if (!noteText) {
        showToast("يرجى كتابة الملاحظة أولاً", "error");
        return;
    }

    let targetStudents = [];
    let compId = null;
    let groupId = null;

    if (state.currentView === 'direct_grading') {
        compId = null;
        groupId = null;
        targetStudents = state.students.filter(s => s.level === state.currentLevel);
    } else if (currentGradingCompId) {
        compId = currentGradingCompId;
        groupId = currentGradingGroupId || null;
        const comp = state.competitions.find(c => c.id === compId);
        if(comp) targetStudents = state.students.filter(s => s.level === comp.level);
    } else {
        showToast("هذه الميزة غير متاحة هنا", "error");
        return;
    }

    if (targetType === 'specific') {
        const checkedBoxes = document.querySelectorAll('.collective-note-student-cb:checked');
        const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
        targetStudents = targetStudents.filter(s => selectedIds.includes(s.id));
    }

    if (!targetStudents || targetStudents.length === 0) {
        showToast("لا يوجد طلاب لإرسال الملاحظة لهم", "error");
        return;
    }

    // Disable button and show loading text
    const submitBtn = document.querySelector('#collective-note-modal button[onclick="submitCollectiveNote()"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> جاري الإرسال...';
    lucide.createIcons();

    let criteriaName = "ملاحظة المعلم (جماعية)";
    if(visibility === 'student') criteriaName += state.currentLevel === 'ijazat' ? " (مباشرة)" : ` (لـ${getLabel('student')} فقط)`;
    else if(visibility === 'parent') criteriaName += state.currentLevel === 'ijazat' ? " (للآخرين فقط)" : ` (لـ${getLabel('parent')} فقط)`;

    try {
        const batch = window.firebaseOps.writeBatch(window.db);
        const timestamp = Date.now();
        const isoDate = new Date().toISOString();

        for (const student of targetStudents) {
            const docRef = window.firebaseOps.doc(window.firebaseOps.collection(window.db, "scores"));
            batch.set(docRef, {
                studentId: student.id,
                competitionId: compId,
                groupId: groupId,
                criteriaId: 'TEACHER_NOTE',
                criteriaName: criteriaName,
                points: 0,
                type: 'neutral',
                noteText: noteText,
                visibility: visibility,
                level: state.currentLevel,
                date: dateVal,
                updatedAt: isoDate,
                timestamp: timestamp,
                createdAt: isoDate,
                isCollective: true // Flag to identify collective notes
            });
        }

        await batch.commit();
        showToast(`تم إرسال الملاحظة إلى ${targetStudents.length} طلاب بنجاح`, "success");
        closeModal('collective-note-modal');
    } catch (e) {
        console.error("Error sending collective notes:", e);
        showToast("حدث خطأ أثناء إرسال الملاحظة الجماعية", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        lucide.createIcons();
    }
}

// =========================================
// الرصد الجماعي (Collective Grading)
// =========================================
async function openCollectiveGradingModal() {
    if (!currentGradingCompId) {
        showToast("لا توجد مسابقة محددة", "error");
        return;
    }
    
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    if (!comp) return;

    // Set default date
    const d = new Date();
    $('#collective-grading-date').value = d.toLocaleDateString('en-CA');
    $('#collective-grading-date').max = d.toLocaleDateString('en-CA');

    // Populate students list: ONLY students who belong to at least one group in this competition
    const studentsContainer = $('#collective-grading-students-list');
    if (studentsContainer && state.students) {
        // Fetch all groups for this competition to get all member IDs
        studentsContainer.innerHTML = '<div class="text-center py-3 text-gray-400 text-sm">جاري تحميل الطلاب...</div>';
        
        try {
            const groupsSnap = await window.firebaseOps.getDocs(
                window.firebaseOps.query(
                    window.firebaseOps.collection(window.db, "groups"),
                    window.firebaseOps.where("competitionId", "==", currentGradingCompId)
                )
            );

            // Collect unique member IDs from all groups
            const memberIds = new Set();
            groupsSnap.forEach(doc => {
                const g = doc.data();
                if (g.members && Array.isArray(g.members)) {
                    g.members.forEach(id => memberIds.add(id));
                }
            });

            // Only show students who are in at least one group
            const cLevel = comp.level || state.currentLevel;
            const targetStudents = state.students.filter(s => s.level === cLevel && memberIds.has(s.id));

            if (targetStudents.length === 0) {
                studentsContainer.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">لا يوجد طلاب في مجموعات هذه المسابقة</p>';
            } else {
                studentsContainer.innerHTML = targetStudents.map(s => `
                    <label class="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer transition">
                        <input type="checkbox" value="${s.id}" class="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 collective-grading-student-cb">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">${s.name}</span>
                    </label>
                `).join('');
            }
        } catch (e) {
            console.error("Error loading groups for collective grading:", e);
            studentsContainer.innerHTML = '<p class="text-center text-red-400 text-sm py-4">خطأ في تحميل الطلاب</p>';
        }
    }

    // Populate Criteria Buttons - show quantity input for repeatable criteria (isMultiplier)
    const criteriaGrid = $('#collective-grading-criteria-grid');
    if (criteriaGrid && comp.criteria) {
        criteriaGrid.innerHTML = comp.criteria.map(c => {
            const isNegative = parseFloat(c.positivePoints) < 0;
            const isMult = !!c.isMultiplier;
            const btnClass = isNegative
                ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200'
                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200';
            
            return `
                <div class="flex flex-col gap-1 p-2 rounded-xl border ${isNegative ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'} dark:bg-gray-700/50">
                    ${isMult ? `
                        <div class="flex items-center gap-1 mb-1">
                            <span class="text-xs text-gray-500 font-bold">العدد:</span>
                            <input type="number" id="cg-qty-${c.id}" value="1" min="1" step="1" 
                                   class="w-16 text-center font-bold border rounded px-1 py-0.5 text-sm bg-white dark:bg-gray-600 focus:outline-none focus:border-emerald-400">
                            <span class="text-xs text-amber-600 font-bold">تكرار</span>
                        </div>
                    ` : ''}
                    <button onclick="submitCollectiveGradingScore('${c.id}', '${c.name}', ${c.positivePoints}, ${isMult})" 
                            class="w-full p-2 rounded-xl border font-bold text-sm shadow-sm transition flex flex-col items-center justify-center gap-1 ${btnClass}">
                        <span>${c.name}</span>
                        <span class="text-xs opacity-80" dir="ltr">${c.positivePoints > 0 ? '+' : ''}${c.positivePoints} نقطة</span>
                    </button>
                </div>
            `;
        }).join('');
    }

    toggleModal('collective-grading-modal', true);
}

function toggleAllCollectiveGradingStudents() {
    const checkboxes = document.querySelectorAll('.collective-grading-student-cb');
    if (!checkboxes || checkboxes.length === 0) return;
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
}

async function submitCollectiveGradingScore(criteriaId, criteriaName, points, isMult) {
    const dateVal = $('#collective-grading-date').value;

    if (!dateVal) {
        showToast("يرجى اختيار التاريخ", "error");
        return;
    }

    const checkedBoxes = document.querySelectorAll('.collective-grading-student-cb:checked');
    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);

    if (selectedIds.length === 0) {
        showToast("الرجاء اختيار طالب واحد على الأقل", "error");
        return;
    }

    // Get repeat count for multiplier criteria
    let multiplier = 1;
    if (isMult) {
        const qtyEl = document.getElementById(`cg-qty-${criteriaId}`);
        multiplier = parseInt(qtyEl ? qtyEl.value : 1) || 1;
        if (multiplier < 1) multiplier = 1;
    }

    const finalPoints = parseFloat(points) * multiplier;
    const finalLabel = isMult && multiplier > 1 ? `${criteriaName} (${multiplier} م)` : criteriaName;

    showToast("جاري الرصد الجماعي...", "info");

    try {
        const timestamp = Date.now();
        const isoDate = new Date().toISOString();

        let successCount = 0;
        let skipCount = 0;

        for (const studentId of selectedIds) {
            // Check if a record already exists today for this student + criteria
            const existingQ = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("studentId", "==", studentId),
                window.firebaseOps.where("competitionId", "==", currentGradingCompId),
                window.firebaseOps.where("criteriaId", "==", criteriaId),
                window.firebaseOps.where("date", "==", dateVal)
            );
            const existingSnap = await window.firebaseOps.getDocs(existingQ);

            if (!isMult) {
                // Non-repeatable: skip if already graded today
                if (!existingSnap.empty) {
                    skipCount++;
                    continue;
                }
                // Create new record
                await window.firebaseOps.addDoc(
                    window.firebaseOps.collection(window.db, "scores"),
                    {
                        studentId: studentId,
                        competitionId: currentGradingCompId,
                        groupId: currentGradingGroupId || null,
                        criteriaId: criteriaId,
                        criteriaName: finalLabel,
                        points: finalPoints,
                        type: finalPoints >= 0 ? 'positive' : 'negative',
                        level: state.currentLevel,
                        date: dateVal,
                        updatedAt: isoDate,
                        timestamp: timestamp,
                        createdAt: isoDate,
                        isCollective: true
                    }
                );
                successCount++;
            } else {
                // Repeatable: UPDATE existing record if found, otherwise create new
                if (!existingSnap.empty) {
                    const existingDoc = existingSnap.docs[0];
                    await window.firebaseOps.updateDoc(existingDoc.ref, {
                        criteriaName: finalLabel,
                        points: finalPoints,
                        updatedAt: isoDate,
                        timestamp: timestamp,
                        isCollective: true
                    });
                } else {
                    await window.firebaseOps.addDoc(
                        window.firebaseOps.collection(window.db, "scores"),
                        {
                            studentId: studentId,
                            competitionId: currentGradingCompId,
                            groupId: currentGradingGroupId || null,
                            criteriaId: criteriaId,
                            criteriaName: finalLabel,
                            points: finalPoints,
                            type: finalPoints >= 0 ? 'positive' : 'negative',
                            level: state.currentLevel,
                            date: dateVal,
                            updatedAt: isoDate,
                            timestamp: timestamp,
                            createdAt: isoDate,
                            isCollective: true
                        }
                    );
                }
                successCount++;
            }
        }

        if (successCount > 0 && skipCount > 0) {
            showToast(`تم رصد ${successCount} طالب. تم تخطي ${skipCount} (مرصودون مسبقاً)`, "success");
        } else if (successCount > 0) {
            showToast(`تم التقييم لـ ${successCount} طالب بنجاح!`, "success");
        } else {
            showToast(`جميع الطلاب المحددين مرصودون مسبقاً لهذا المعيار اليوم`, "error");
        }
    } catch (e) {
        console.error("Error sending collective score", e);
        showToast("حدث خطأ أثناء الإرسال", "error");
    }
}

// ====================================================
// ✅ نظام الخطط المرن - Flexible Plans System v1.0
// ====================================================

// === 1. PLAN GENERATION ENGINE ===

const PLAN_LINES_PER_PAGE = 15;

/**
 * Get all ayahs from startSura/startAyah onwards (uses QuranService)
 */
function getPlanAyahRange(startSura, startAyah, endSura = 114, endAyah = 9999) {
    if (!window.QuranService || !window.QuranService.isLoaded()) return [];
    const suras = window.QuranService.getSuras();
    const result = [];
    for (const sura of suras) {
        if (sura.number < startSura) continue;
        if (sura.number > endSura) break;
        const ayahs = window.QuranService.getAyahs(sura.number)
            .filter(a => a.aya_no > 0)
            .sort((a, b) => a.aya_no - b.aya_no);
        for (const a of ayahs) {
            if (sura.number === startSura && a.aya_no < startAyah) continue;
            if (sura.number === endSura && a.aya_no > endAyah) continue;
            result.push(a);
        }
    }
    return result;
}

/**
 * Get the next ayah after (suraNo, ayahNo)
 */
function getNextAyahPos(suraNo, ayahNo) {
    if (!window.QuranService) return null;
    const ayahs = window.QuranService.getAyahs(suraNo)
        .filter(a => a.aya_no > 0)
        .sort((a, b) => a.aya_no - b.aya_no);
    const idx = ayahs.findIndex(a => a.aya_no === ayahNo);
    if (idx >= 0 && idx < ayahs.length - 1) {
        return { sura_no: suraNo, aya_no: ayahs[idx + 1].aya_no };
    }
    // End of sura → next sura
    if (suraNo >= 114) return null;
    const nextAyahs = window.QuranService.getAyahs(suraNo + 1)
        .filter(a => a.aya_no > 0)
        .sort((a, b) => a.aya_no - b.aya_no);
    return nextAyahs.length > 0 ? { sura_no: suraNo + 1, aya_no: nextAyahs[0].aya_no } : null;
}

/**
 * Build sections summary from a list of ayahs (grouped by sura)
 */
function buildSectionsFromAyahs(ayahs) {
    if (!ayahs || ayahs.length === 0) return [];
    const suras = window.QuranService ? window.QuranService.getSuras() : [];
    const sections = [];
    let cur = null;
    for (const a of ayahs) {
        if (!cur || cur.suraNo !== a.sura_no) {
            if (cur) sections.push(cur);
            const info = suras.find(s => s.number === a.sura_no);
            cur = {
                suraNo: a.sura_no,
                suraName: info ? info.name : `سورة ${a.sura_no}`,
                fromAyah: a.aya_no, toAyah: a.aya_no,
                fromPage: a.page || 1, toPage: a.page || 1
            };
        } else {
            cur.toAyah = a.aya_no;
            cur.toPage = a.page || cur.toPage;
        }
    }
    if (cur) sections.push(cur);
    return sections;
}

/**
 * Format plan day description for display
 */
function formatPlanDayDesc(plannedSections) {
    if (!plannedSections || plannedSections.length === 0) return 'لا يوجد ورد';
    if (plannedSections.length === 1) {
        const s = plannedSections[0];
        if (s.fromAyah === s.toAyah) return `سورة ${s.suraName} (${s.fromAyah}) ص${s.fromPage}`;
        return `سورة ${s.suraName} (${s.fromAyah} - ${s.toAyah}) ص${s.fromPage}-${s.toPage}`;
    }
    const first = plannedSections[0], last = plannedSections[plannedSections.length - 1];
    return `من ${first.suraName} (${first.fromAyah}) إلى ${last.suraName} (${last.toAyah})`;
}

/**
 * Generate active study dates between startDate and endDate
 * Uses state.activeWeekDays (defaults to Sun-Thu)
 */
function generatePlanStudyDates(startDate, endDate) {
    const activeDays = (state.activeWeekDays && state.activeWeekDays.length > 0)
        ? state.activeWeekDays : ['sun', 'mon', 'tue', 'wed', 'thu'];
    const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const activeNums = new Set(activeDays.map(d => dayMap[d] ?? 0));
    const dates = [];
    const cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (cur <= end) {
        if (activeNums.has(cur.getDay())) {
            dates.push(cur.toISOString().split('T')[0]);
        }
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

/**
 * Core flexible plan generator — page-based, never cuts ayahs
 * Returns [{date, startSura, startAyah, endSura, endAyah, startPage, endPage, plannedSections}]
 */

window.getLocalYYYYMMDD = function(d) {
    const pad = n => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
function generateFlexiblePlan({ startSura, startAyah, endSura, endAyah, pagesPerDay, targetDays, studyDates, startDate, generateMode }) {
    const isDaysPages = generateMode === 'days_pages';
    // For days_pages: end is open (determined by pages×days), so use full Quran as source
    const allAyahs = getPlanAyahRange(startSura, startAyah, isDaysPages ? 114 : (endSura || 114), isDaysPages ? 9999 : (endAyah || 9999));
    if (allAyahs.length === 0) return [];

    const pageFirstAyah = {};
    const pageLastAyah = {};
    for (let i = 0; i < allAyahs.length; i++) {
        const a = allAyahs[i];
        if (!pageFirstAyah[a.page]) pageFirstAyah[a.page] = a.id;
        pageLastAyah[a.page] = a.id;
    }

    const getPageMaxLine = (p) => (p === 1 || p === 2) ? 8 : 15;

    const getVolume = (startA, endA) => {
        const maxL_start = getPageMaxLine(startA.page);
        let startPos = startA.page - 1;
        if (startA.id !== pageFirstAyah[startA.page]) {
            startPos += (startA.line_start - 1) / maxL_start;
        }

        const maxL_end = getPageMaxLine(endA.page);
        let endPos = endA.page - 1;
        if (endA.id === pageLastAyah[endA.page]) {
            endPos += 1.0;
        } else {
            endPos += endA.line_end / maxL_end;
        }

        return endPos - startPos;
    };

    let targetPagesPerDay = pagesPerDay || 1;
    let reqDays = targetDays;

    if (generateMode === 'days') {
        const totalVolume = getVolume(allAyahs[0], allAyahs[allAyahs.length - 1]);
        targetPagesPerDay = totalVolume / targetDays;
    } else if (generateMode === 'pages') {
        const totalVolume = getVolume(allAyahs[0], allAyahs[allAyahs.length - 1]);
        reqDays = Math.ceil(totalVolume / targetPagesPerDay);
    } else if (generateMode === 'days_pages') {
        reqDays = targetDays;
    }

    if (!studyDates || studyDates.length === 0 || studyDates.length !== reqDays) {
        const activeDays = (state.activeWeekDays && state.activeWeekDays.length > 0)
            ? state.activeWeekDays : ['sun', 'mon', 'tue', 'wed', 'thu'];
        const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
        const activeNums = new Set(activeDays.map(d => dayMap[d] ?? 0));
        
        let datesArray = [];
        let curDate = new Date((startDate || window.getLocalYYYYMMDD(new Date())) + 'T00:00:00');
        let limit = 2000;
        while (datesArray.length < reqDays && limit-- > 0) {
            if (activeNums.has(curDate.getDay())) {
                datesArray.push(window.getLocalYYYYMMDD(curDate));
            }
            curDate.setDate(curDate.getDate() + 1);
        }
        studyDates = datesArray;
    }

    const days = [];
    let idx = 0;

    for (let i = 0; i < studyDates.length; i++) {
        if (idx >= allAyahs.length) break;
        const date = studyDates[i];
        const dayStart = allAyahs[idx];
        let dayEnd = null, tempIdx = idx;

        while (tempIdx < allAyahs.length) {
            const a = allAyahs[tempIdx];
            
            if ((generateMode === 'pages' || generateMode === 'days') && i === studyDates.length - 1) {
                // last day in pages/days mode consumes everything left up to the defined end
                dayEnd = a;
                tempIdx++;
            } else {
                const remainingDays = studyDates.length - i;
                const dynamicTarget = (generateMode === 'days') && remainingDays > 0 
                    ? getVolume(dayStart, allAyahs[allAyahs.length - 1]) / remainingDays 
                    : targetPagesPerDay;
                const curVol = getVolume(dayStart, a);
                if (curVol > dynamicTarget && tempIdx > idx) {
                    break;
                }
                dayEnd = a;
                tempIdx++;
            }
        }
        if (!dayEnd) break;

        const dayAyahs = allAyahs.slice(idx, tempIdx);
        days.push({
            date,
            startSura: dayStart.sura_no, startAyah: dayStart.aya_no,
            endSura: dayEnd.sura_no, endAyah: dayEnd.aya_no,
            startPage: dayStart.page || 1, endPage: dayEnd.page || 1,
            plannedSections: buildSectionsFromAyahs(dayAyahs)
        });
        idx = tempIdx;
    }
    return days;
}

function validatePlanGaps(days) {
    const gaps = [];
    for (let i = 1; i < days.length; i++) {
        const prev = days[i - 1], curr = days[i];
        const expected = getNextAyahPos(prev.endSura, prev.endAyah);
        if (expected && (expected.sura_no !== curr.startSura || expected.aya_no !== curr.startAyah)) {
            gaps.push({ dayIndex: i, date: curr.date, prevDate: prev.date });
        }
    }
    return gaps;
}

// === 2. DATABASE OPERATIONS ===

async function saveStudentPlanToDB(planData, dailyRecords) {
    // Delete existing active plans of same type for this student
    try {
        const exQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, 'student_plans'),
            window.firebaseOps.where('student_id', '==', planData.studentId),
            window.firebaseOps.where('plan_type', '==', planData.planType),
            window.firebaseOps.where('status', '==', 'active')
        );
        const exSnap = await window.firebaseOps.getDocs(exQ);
        for (const d of exSnap.docs) {
            const rQ = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, 'plan_daily_records'),
                window.firebaseOps.where('plan_id', '==', d.id)
            );
            const rSnap = await window.firebaseOps.getDocs(rQ);
            for (const r of rSnap.docs) {
                await window.firebaseOps.deleteDoc(
                    window.firebaseOps.doc(window.db, 'plan_daily_records', r.id));
            }
            await window.firebaseOps.deleteDoc(
                window.firebaseOps.doc(window.db, 'student_plans', d.id));
        }
    } catch(e) { console.warn('cleanup old plans:', e); }

    const planRef = await window.firebaseOps.addDoc(
        window.firebaseOps.collection(window.db, 'student_plans'), {
            student_id: planData.studentId,
            plan_type: planData.planType,
            start_date: planData.startDate,
            end_date: planData.endDate,
            start_sura: planData.startSura,
            start_ayah: planData.startAyah,
            end_sura: planData.endSura, end_ayah: planData.endAyah,
            start_page: dailyRecords[0]?.startPage || 1,
            end_page: dailyRecords[dailyRecords.length - 1]?.endPage || 604,
            active_week_days: state.activeWeekDays || ['sun', 'mon', 'tue', 'wed', 'thu'],
            pages_per_day: planData.pagesPerDay,
            level: state.currentLevel,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    );

    for (const day of dailyRecords) {
        await window.firebaseOps.addDoc(
            window.firebaseOps.collection(window.db, 'plan_daily_records'), {
                plan_id: planRef.id,
                student_id: planData.studentId,
                date: day.date,
                planned_start_sura: day.startSura, planned_start_ayah: day.startAyah,
                planned_end_sura: day.endSura, planned_end_ayah: day.endAyah,
                planned_start_page: day.startPage, planned_end_page: day.endPage,
                planned_sections: day.plannedSections || [],
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        );
    }
    // Save a full snapshot of original plan records into student_plans for undo support
    const originalSnapshot = dailyRecords.map(d => ({
        date: d.date,
        planned_start_sura: d.startSura,
        planned_start_ayah: d.startAyah,
        planned_end_sura: d.endSura,
        planned_end_ayah: d.endAyah,
        planned_start_page: d.startPage,
        planned_end_page: d.endPage,
        planned_sections: d.plannedSections || []
    }));
    await window.firebaseOps.updateDoc(
        window.firebaseOps.doc(window.db, 'student_plans', planRef.id),
        { original_snapshot: originalSnapshot, updatedAt: new Date().toISOString() }
    );
    return planRef.id;
}

async function loadPlanDailyRecords(planId) {
    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, 'plan_daily_records'),
        window.firebaseOps.where('plan_id', '==', planId)
    );
    const snap = await window.firebaseOps.getDocs(q);
    const records = [];
    snap.forEach(doc => { const d = doc.data(); d.id = doc.id; records.push(d); });
    return records.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

async function getStudentPlanEntriesForDate(studentId, date) {
    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, 'plan_daily_records'),
        window.firebaseOps.where('student_id', '==', studentId),
        window.firebaseOps.where('date', '==', date)
    );
    const snap = await window.firebaseOps.getDocs(q);
    const entries = [];
    for (const doc of snap.docs) {
        const rec = { id: doc.id, ...doc.data() };
        try {
            const planDoc = await window.firebaseOps.getDoc(
                window.firebaseOps.doc(window.db, 'student_plans', rec.planId));
            if (planDoc.exists() && planDoc.data().status === 'active') {
                entries.push({ record: rec, plan: { id: planDoc.id, ...planDoc.data() } });
            }
        } catch(e) { console.warn('plan fetch:', e); }
    }
    return entries;
}

// === 3. REDISTRIBUTION ENGINE ===

async function redistributeStudentPlan(planId, fromDate, actualEndSura, actualEndAyah, mode) {
    try {
        const planDoc = await window.firebaseOps.getDoc(
            window.firebaseOps.doc(window.db, 'student_plans', planId));
        if (!planDoc.exists()) return;
        const plan = { id: planDoc.id, ...planDoc.data() };

        const allRecords = await loadPlanDailyRecords(planId);
        const currentRecord = allRecords.find(r => r.date === fromDate);
        const futureRecords = allRecords
            .filter(r => r.date > fromDate && r.status === 'pending')
            .sort((a, b) => a.date.localeCompare(b.date));

        if (futureRecords.length === 0) return;

        let newStartSura, newStartAyah;
        if (actualEndSura == null || actualEndAyah == null) {
            // Absent: restart from planned start of current day
            newStartSura = currentRecord?.plannedStartSura || plan.startSura;
            newStartAyah = currentRecord?.plannedStartAyah || plan.startAyah;
        } else {
            const next = getNextAyahPos(actualEndSura, actualEndAyah);
            if (!next) {
                // Finished Quran!
                await window.firebaseOps.updateDoc(
                    window.firebaseOps.doc(window.db, 'student_plans', planId),
                    { status: 'completed', updatedAt: new Date().toISOString() });
                return;
            }
            newStartSura = next.sura_no;
            newStartAyah = next.aya_no;
        }

        if (mode === 'rollover' && futureRecords.length > 0) {
            const nextDay = futureRecords[0];
            // Save a compact snapshot of ALL future records before modifying the first one
            const snapshot = futureRecords.map(r => ({
                id: r.id,
                date: r.date,
                planned_start_sura: r.planned_start_sura || r.plannedStartSura,
                planned_start_ayah: r.planned_start_ayah || r.plannedStartAyah,
                planned_end_sura: r.planned_end_sura || r.plannedEndSura,
                planned_end_ayah: r.planned_end_ayah || r.plannedEndAyah,
                planned_start_page: r.planned_start_page || r.plannedStartPage || 1,
                planned_end_page: r.planned_end_page || r.plannedEndPage || 1,
                planned_sections: r.planned_sections || r.plannedSections || []
            }));
            const allAyahs = getPlanAyahRange(newStartSura, newStartAyah, nextDay.plannedEndSura || nextDay.planned_end_sura, nextDay.plannedEndAyah || nextDay.planned_end_ayah);
            const newSections = buildSectionsFromAyahs(allAyahs);
            // Save snapshot into current day record, then update next day
            if (currentRecord) {
                await window.firebaseOps.updateDoc(
                    window.firebaseOps.doc(window.db, 'plan_daily_records', currentRecord.id),
                    { undo_snapshot: snapshot, updatedAt: new Date().toISOString() }
                );
            }
            await window.firebaseOps.updateDoc(
                window.firebaseOps.doc(window.db, 'plan_daily_records', nextDay.id), {
                    planned_start_sura: newStartSura,
                    planned_start_ayah: newStartAyah,
                    planned_sections: newSections,
                    planned_start_page: allAyahs[0]?.page || 1,
                    updatedAt: new Date().toISOString()
                }
            );
            return;
        }

        // --- Save compact snapshot of future records before any changes ---
        const snapshot = futureRecords.map(r => ({
            id: r.id,
            date: r.date,
            planned_start_sura: r.planned_start_sura || r.plannedStartSura,
            planned_start_ayah: r.planned_start_ayah || r.plannedStartAyah,
            planned_end_sura: r.planned_end_sura || r.plannedEndSura,
            planned_end_ayah: r.planned_end_ayah || r.plannedEndAyah,
            planned_start_page: r.planned_start_page || r.plannedStartPage || 1,
            planned_end_page: r.planned_end_page || r.plannedEndPage || 1,
            planned_sections: r.planned_sections || r.plannedSections || []
        }));
        if (currentRecord) {
            await window.firebaseOps.updateDoc(
                window.firebaseOps.doc(window.db, 'plan_daily_records', currentRecord.id),
                { undo_snapshot: snapshot, updatedAt: new Date().toISOString() }
            );
        }

        const futureDates = futureRecords.map(r => r.date);
        const originalActiveDays = state.activeWeekDays;
        if (plan.activeWeekDays) state.activeWeekDays = plan.activeWeekDays;
        let genMode = 'pages';
        let tDays = undefined;
        if (mode === 'distribute' && futureRecords.length > 0) {
            genMode = 'days';
            tDays = futureRecords.length;
        }

        const newDays = generateFlexiblePlan({
            startSura: newStartSura, startAyah: newStartAyah,
            endSura: plan.endSura || 114, endAyah: plan.endAyah || 9999,
            pagesPerDay: plan.pagesPerDay || 1,
            targetDays: tDays,
            startDate: futureDates[0] || window.getLocalYYYYMMDD(new Date()),
            generateMode: genMode
        });
        state.activeWeekDays = originalActiveDays;

        // Delete old future records
        for (const r of futureRecords) {
            await window.firebaseOps.deleteDoc(
                window.firebaseOps.doc(window.db, 'plan_daily_records', r.id));
        }
        // Create new records
        const studentId = futureRecords[0].student_id;
        for (const day of newDays) {
            await window.firebaseOps.addDoc(
                window.firebaseOps.collection(window.db, 'plan_daily_records'), {
                    plan_id: planId, student_id: studentId, date: day.date,
                    planned_start_sura: day.startSura, planned_start_ayah: day.startAyah,
                    planned_end_sura: day.endSura, planned_end_ayah: day.endAyah,
                    planned_start_page: day.startPage, planned_end_page: day.endPage,
                    planned_sections: day.plannedSections || [],
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            );
        }
    } catch(e) { console.error('redistribute plan:', e); }
}

// === 4. PLANS VIEW ===

async function renderPlans() {
    const container = $('#view-container');
    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <div class="flex justify-between items-center gap-2">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <i data-lucide="book-marked" class="w-6 h-6 text-emerald-600 dark:text-emerald-400"></i>
                    الخطط <span class="text-[10px] font-bold tracking-wider text-emerald-800 bg-emerald-100/80 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800/50 px-2 py-0.5 rounded-lg ml-2 relative -top-1 shadow-sm">بيتا</span>
                </h2>
                ${state.isTeacher ? `
                <div class="flex gap-2">
                    <button onclick="openCreatePlanModal('individual')" class="bg-emerald-700 text-white px-3 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-800 transition flex items-center gap-1">
                        <i data-lucide="plus" class="w-4 h-4"></i> فردية
                    </button>
                    <button onclick="openCreatePlanModal('group')" class="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700 transition flex items-center gap-1">
                        <i data-lucide="users" class="w-4 h-4"></i> جماعية
                    </button>
                </div>` : ''}
            </div>
            <div id="plans-list" class="space-y-3">
                <div class="flex justify-center py-10">
                    <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-emerald-600"></i>
                </div>
            </div>
        </div>`;
    lucide.createIcons();
    await _loadAllPlans();
}

async function _loadAllPlans() {
    const container = document.getElementById('plans-list');
    if (!container) return;
    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, 'student_plans'),
            window.firebaseOps.where('level', '==', state.currentLevel),
            window.firebaseOps.where('status', '==', 'active')
        );
        const snap = await window.firebaseOps.getDocs(q);
        const plans = [];
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; plans.push(d); });

        if (plans.length === 0) {
            container.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
                    <i data-lucide="book-open" class="w-14 h-14 mx-auto mb-3 text-gray-200 dark:text-gray-600"></i>
                    <p class="text-gray-500 font-bold">لا توجد خطط نشطة</p>
                    ${state.isTeacher ? '<p class="text-gray-400 text-sm mt-1">اضغط "فردية" أو "جماعية" لإنشاء خطة جديدة</p>' : ''}
                </div>`;
            lucide.createIcons(); return;
        }

        const byStudent = {};
        plans.forEach(p => {
            // Support both snake_case (supabase) and camelCase (legacy)
            const sid = p.student_id || p.studentId;
            if (!byStudent[sid]) byStudent[sid] = [];
            byStudent[sid].push(p);
        });
        const today = new Date().toISOString().split('T')[0];
        const suras = window.QuranService ? window.QuranService.getSuras() : [];

        let html = '';
        for (const [sid, sPlans] of Object.entries(byStudent)) {
            const st = state.students.find(s => s.id === sid);
            const iconHtml = st && isImgSrc(st.icon)
                ? `<img src="${st.icon}" class="w-full h-full object-cover rounded-full">`
                : (st?.icon || '👤');

            html += `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                    <div class="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center text-base overflow-hidden shrink-0">${iconHtml}</div>
                    <p class="font-bold flex-1 text-sm">${st?.name || 'طالب'}</p>
                    ${state.isTeacher ? `<button onclick="openCreatePlanModal('individual','${sid}')" class="text-emerald-600 p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition"><i data-lucide="plus-circle" class="w-4 h-4"></i></button>` : ''}
                </div>
                ${sPlans.map(p => {
                    const startSuraName = suras.find(s => s.number === p.startSura)?.name || `سورة ${p.startSura}`;
                    const typeLabel = p.planType === 'memorization' ? '📝 حفظ' : p.planType === 'minor_review' ? '📗 م.ص' : '🔄 مراجعة';
                    const typeColor = p.planType === 'memorization' ? 'emerald' : p.planType === 'minor_review' ? 'orange' : 'purple';
                    const expired = p.endDate < today;
                    const daysLeft = Math.max(0, Math.ceil((new Date(p.endDate + 'T00:00:00') - new Date()) / 86400000));
                    return `
                    <div class="p-4 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex gap-2 flex-wrap">
                                <span class="text-xs font-bold px-2 py-1 rounded-lg bg-${typeColor}-100 dark:bg-${typeColor}-900/30 text-${typeColor}-700 dark:text-${typeColor}-400">${typeLabel}</span>
                                ${expired ? '<span class="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700">منتهية</span>' : ''}
                            </div>
                            ${state.isTeacher ? `
                            <div class="flex gap-1">
                                <button onclick="viewPlanSchedule('${p.id}')" class="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title="عرض الجدول"><i data-lucide="list" class="w-4 h-4"></i></button>
                                <button onclick="confirmDeletePlan('${p.id}')" class="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="حذف"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </div>` : ''}
                        </div>
                        <div class="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                            <p>📖 من سورة ${startSuraName} آية ${p.startAyah}</p>
                            <p>📅 ${p.startDate} ← ${p.endDate}</p>
                            <p>📄 ${p.pagesPerDay || 1} صفحة/يوم${!expired ? ` · ${daysLeft} يوم متبقي` : ''}</p>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
        }
        container.innerHTML = html;
        lucide.createIcons();
    } catch(e) {
        console.error('load plans:', e);
        container.innerHTML = '<p class="text-center text-red-500 p-4">خطأ في تحميل الخطط</p>';
    }
}

// === 5. CREATE PLAN MODAL ===

window.openCreatePlanModal = function(mode, preSelectedStudentId) {
    if (!window.QuranService || !window.QuranService.isLoaded()) {
        showToast('يرجى الانتظار لتحميل بيانات المصحف', 'error');
        if (window.QuranService) window.QuranService.loadData().then(() => openCreatePlanModal(mode, preSelectedStudentId));
        return;
    }
    const suras = window.QuranService.getSuras();
    const suraOpts = suras.map(s => `<option value="${s.number}">${s.name}</option>`).join('');
    const today = new Date().toISOString().split('T')[0];

    const studentPickerHTML = mode === 'individual'
        ? `<div>
            <label class="block text-sm font-bold mb-2">الطالب</label>
            <select id="cp-student" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                <option value="">-- اختر الطالب --</option>
                ${state.students.map(s => `<option value="${s.id}" ${s.id === preSelectedStudentId ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
        </div>`
        : `<div>
            <label class="block text-sm font-bold mb-2">اختر الطلاب</label>
            <div class="bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-3 max-h-36 overflow-y-auto space-y-2">
                ${state.students.map(s => `<label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" class="cp-stud-cb w-4 h-4 accent-emerald-600" value="${s.id}"><span class="text-sm">${s.name}</span></label>`).join('')}
            </div>
        </div>`;

    let modal = document.getElementById('create-plan-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'create-plan-modal'; document.body.appendChild(modal); }
    modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]">
            <div class="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
                <h3 class="font-bold text-lg text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <i data-lucide="book-marked" class="w-5 h-5"></i>
                    إنشاء خطة ${mode === 'group' ? 'جماعية' : 'فردية'}
                </h3>
                <button onclick="document.getElementById('create-plan-modal').remove()" class="text-gray-400 hover:text-gray-600 p-2 rounded-full bg-gray-50 dark:bg-gray-700 transition">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-5 overflow-y-auto flex-1 space-y-4">
                ${studentPickerHTML}
                <div>
                    <label class="block text-sm font-bold mb-2">نوع الخطة</label>
                    <div class="grid grid-cols-2 gap-3">
                        <button id="cp-btn-mem" onclick="_cpSelectType('memorization')" class="py-2 rounded-xl font-bold text-sm border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 transition">📝 حفظ</button>
                        <button id="cp-btn-minor" onclick="_cpSelectType('minor_review')" class="py-2 rounded-xl font-bold text-sm border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition">📗 م.ص</button>
                        <button id="cp-btn-rev" onclick="_cpSelectType('review')" class="py-2 rounded-xl font-bold text-sm border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition">🔄 مراجعة</button>
                    </div>
                    <input type="hidden" id="cp-type" value="memorization">
                </div>
                
                <div>
                    <label class="block text-sm font-bold mb-2">نطاق الخطة</label>
                    <div class="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl">
                        <div>
                            <p class="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">من سورة / آية</p>
                            <select id="cp-start-sura" onchange="_cpUpdateAyahs('start')" class="w-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs mb-1 focus:outline-none focus:border-emerald-500">${suraOpts}</select>
                            <select id="cp-start-ayah" class="w-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-500"><option value="1">1</option></select>
                        </div>
                        <div id="cp-end-range-container">
                            <p class="text-xs font-bold text-red-500 dark:text-red-400 mb-1">إلى سورة / آية</p>
                            <select id="cp-end-sura" onchange="_cpUpdateAyahs('end')" class="w-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs mb-1 focus:outline-none focus:border-emerald-500">
                                <option value="114" selected>الناس</option>
                                ${suraOpts}
                            </select>
                            <select id="cp-end-ayah" class="w-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-500"><option value="9999">نهاية السورة</option></select>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-bold mb-2">طريقة التوزيع</label>
                    <div class="flex flex-col gap-2 bg-gray-100 dark:bg-gray-700 p-1.5 rounded-xl mb-3">
                        <button onclick="_cpSetMode('pages')" id="cp-tab-pages" class="flex-1 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-gray-600 shadow text-emerald-600 dark:text-emerald-400 transition">تحديد الكميه وعدد الصفحات يوميا</button>
                        <button onclick="_cpSetMode('days')" id="cp-tab-days" class="flex-1 py-1.5 text-xs font-bold rounded-lg text-gray-500 dark:text-gray-400 transition">تحديد مده وكميه</button>
                        <button onclick="_cpSetMode('days_pages')" id="cp-tab-days_pages" class="flex-1 py-1.5 text-xs font-bold rounded-lg text-gray-500 dark:text-gray-400 transition">تحديد مده وعدد صفحات يوميا</button>
                    </div>
                    <input type="hidden" id="cp-gen-mode" value="pages">

                    <!-- Mode 1: Pages -->
                    <div id="cp-mode-pages" class="space-y-3">
                        <div>
                            <label class="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400">تاريخ البداية (سيتم حساب النهاية تلقائياً)</label>
                            <input type="date" id="cp-start-date" value="${today}" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400">الكمية اليومية المطلوبة</label>
                            <select id="cp-pages" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                                <option value="0.25">ربع صفحة</option>
                                <option value="0.5">نصف صفحة</option>
                                <option value="0.75">ثلاثة أرباع صفحة</option>
                                <option value="1" selected>صفحة كاملة</option>
                                <option value="1.5">صفحة ونصف</option>
                                <option value="2">صفحتان</option>
                                <option value="2.5">صفحتان ونصف</option>
                                <option value="3">3 صفحات</option>
                                <option value="4">4 صفحات</option>
                                <option value="5">5 صفحات</option>
                            </select>
                        </div>
                    </div>

                    <!-- Mode 2: Days -->
                    <div id="cp-mode-days" class="space-y-3 hidden">
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400">تاريخ البداية</label>
                                <input type="date" id="cp-start-date-2" value="${today}" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                            </div>
                            <div>
                                <label class="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400">تاريخ النهاية</label>
                                <input type="date" id="cp-end-date-2" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                            </div>
                        </div>
                    </div>

                    <!-- Mode 3: Days & Pages -->
                    <div id="cp-mode-days_pages" class="space-y-3 hidden">
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400">تاريخ البداية</label>
                                <input type="date" id="cp-start-date-3" value="${today}" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                            </div>
                            <div>
                                <label class="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400">تاريخ النهاية</label>
                                <input type="date" id="cp-end-date-3" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400">الكمية اليومية المطلوبة</label>
                            <select id="cp-pages-3" class="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                                <option value="0.25">ربع صفحة</option>
                                <option value="0.5">نصف صفحة</option>
                                <option value="0.75">ثلاثة أرباع صفحة</option>
                                <option value="1" selected>صفحة كاملة</option>
                                <option value="1.5">صفحة ونصف</option>
                                <option value="2">صفحتان</option>
                                <option value="2.5">صفحتان ونصف</option>
                                <option value="3">3 صفحات</option>
                                <option value="4">4 صفحات</option>
                                <option value="5">5 صفحات</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div class="p-5 border-t border-gray-100 dark:border-gray-700 shrink-0 grid grid-cols-2 gap-3">
                <button onclick="document.getElementById('create-plan-modal').remove()" class="py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition">إلغاء</button>
                <button onclick="_cpPreview('${mode}')" class="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition flex items-center justify-center gap-2">
                    <i data-lucide="eye" class="w-4 h-4"></i> معاينة الخطة
                </button>
            </div>
        </div>`;
    lucide.createIcons();
    _cpUpdateAyahs('start');
    _cpUpdateAyahs('end');
    
    // Select last sura for end-sura
    document.getElementById('cp-end-sura').value = "114";
};

window._cpSelectType = function(type) {
    document.getElementById('cp-type').value = type;
    const mem = document.getElementById('cp-btn-mem');
    const minor = document.getElementById('cp-btn-minor');
    const rev = document.getElementById('cp-btn-rev');
    const activeClass = (color) => `py-2 rounded-xl font-bold text-sm border-2 border-${color}-400 bg-${color}-50 dark:bg-${color}-900/20 text-${color}-700 dark:text-${color}-400 transition scale-[1.02] shadow-sm`;
    const inactiveClass = 'py-2 rounded-xl font-bold text-sm border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-600';

    if (mem) mem.className = type === 'memorization' ? activeClass('emerald') : inactiveClass;
    if (minor) minor.className = type === 'minor_review'  ? activeClass('orange')  : inactiveClass;
    if (rev) rev.className = type === 'review'       ? activeClass('purple')  : inactiveClass;
};

window._cpSetMode = function(mode) {
    document.getElementById('cp-gen-mode').value = mode;
    ['pages', 'days', 'days_pages'].forEach(m => {
        const tab = document.getElementById('cp-tab-' + m);
        const sec = document.getElementById('cp-mode-' + m);
        if (m === mode) {
            tab.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-gray-600 shadow text-emerald-600 dark:text-emerald-400 transition';
            sec.classList.remove('hidden');
        } else {
            tab.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-gray-500 dark:text-gray-400 transition';
            sec.classList.add('hidden');
        }
    });
    
    const endRange = document.getElementById('cp-end-range-container');
    if (mode === 'days_pages') {
        endRange.classList.add('hidden');
    } else {
        endRange.classList.remove('hidden');
    }
};

window._cpUpdateAyahs = function(prefix) {
    const suraNo = parseInt(document.getElementById(`cp-${prefix}-sura`)?.value || (prefix==='start'?1:114));
    const sel = document.getElementById(`cp-${prefix}-ayah`);
    if (!sel || !window.QuranService) return;
    const ayahs = window.QuranService.getAyahs(suraNo)
        .filter(a => a.aya_no > 0).sort((a, b) => a.aya_no - b.aya_no);
    const opts = ayahs.map(a => `<option value="${a.aya_no}">${a.aya_no}</option>`).join('');
    sel.innerHTML = prefix === 'end' ? opts + '<option value="9999" selected>نهاية السورة</option>' : opts;
};

window._cpPreview = function(mode) {
    const genMode = document.getElementById('cp-gen-mode')?.value || 'pages';
    let startDate = null;
    let endDate = null;
    let targetDays = null;
    let pagesPerDay = null;
    let studyDates = [];
    
    if (genMode === 'days') {
        startDate = document.getElementById('cp-start-date-2')?.value;
        endDate = document.getElementById('cp-end-date-2')?.value;
        if (!startDate || !endDate) { showToast('يرجى تحديد التواريخ', 'error'); return; }
        if (endDate <= startDate) { showToast('تاريخ النهاية يجب أن يكون بعد البداية', 'error'); return; }
        studyDates = generatePlanStudyDates(startDate, endDate);
        if (studyDates.length === 0) { showToast('لا توجد أيام دراسة في الفترة المحددة', 'error'); return; }
        targetDays = studyDates.length;
    } else if (genMode === 'days_pages') {
        startDate = document.getElementById('cp-start-date-3')?.value;
        endDate = document.getElementById('cp-end-date-3')?.value;
        pagesPerDay = parseFloat(document.getElementById('cp-pages-3')?.value || 1);
        if (!startDate || !endDate) { showToast('يرجى تحديد التواريخ', 'error'); return; }
        if (endDate <= startDate) { showToast('تاريخ النهاية يجب أن يكون بعد البداية', 'error'); return; }
        studyDates = generatePlanStudyDates(startDate, endDate);
        if (studyDates.length === 0) { showToast('لا توجد أيام دراسة في الفترة المحددة', 'error'); return; }
        targetDays = studyDates.length;
    } else {
        pagesPerDay = parseFloat(document.getElementById('cp-pages')?.value || 1);
        startDate = document.getElementById('cp-start-date')?.value;
        if (!startDate) { showToast('يرجى تحديد تاريخ البداية', 'error'); return; }
    }

    const startSura = parseInt(document.getElementById('cp-start-sura')?.value || 1);
    const startAyah = parseInt(document.getElementById('cp-start-ayah')?.value || 1);
    const endSura = parseInt(document.getElementById('cp-end-sura')?.value || 114);
    const endAyah = parseInt(document.getElementById('cp-end-ayah')?.value || 9999);
    const planType = document.getElementById('cp-type')?.value || 'memorization';

    let studentIds = [];
    if (mode === 'individual') {
        const sid = document.getElementById('cp-student')?.value;
        if (!sid) { showToast('يرجى اختيار الطالب', 'error'); return; }
        studentIds = [sid];
    } else {
        document.querySelectorAll('.cp-stud-cb:checked').forEach(cb => studentIds.push(cb.value));
        if (studentIds.length === 0) { showToast('يرجى اختيار طالب واحد على الأقل', 'error'); return; }
    }

    const days = generateFlexiblePlan({ startSura, startAyah, endSura, endAyah, pagesPerDay, targetDays, studyDates, startDate, generateMode: genMode });
    if (days.length === 0) { showToast('تعذر توليد الخطة. تأكد من بيانات النطاق', 'error'); return; }

    if (genMode === 'pages' || genMode === 'days_pages') {
        endDate = days[days.length - 1].date;
        studyDates = days.map(d => d.date);
    } else {
        // days mode: calculate the pages per day to show to user
        const getVol = (a, b) => (b.endPage - a.startPage) + 1; // approx
        pagesPerDay = (days.reduce((acc, d) => acc + getVol(d, d), 0) / days.length).toFixed(1);
    }

    const gaps = validatePlanGaps(days);
    let pagesLabel = '';
    if (genMode === 'pages') {
        const el = document.getElementById('cp-pages');
        pagesLabel = el.options[el.selectedIndex]?.text;
    } else if (genMode === 'days_pages') {
        const el = document.getElementById('cp-pages-3');
        pagesLabel = el.options[el.selectedIndex]?.text;
    } else {
        pagesLabel = `متوسط ${pagesPerDay} صفحة يومياً`;
    }

    window._planPreviewData = { mode, startDate, endDate, startSura, startAyah, endSura: days[days.length-1].endSura, endAyah: days[days.length-1].endAyah, pagesPerDay, planType, studyDates, days, gaps, studentIds, pagesLabel };
    _showPlanPreviewModal(days, gaps, planType, pagesLabel);
};

function _showPlanPreviewModal(days, gaps, planType, pagesLabel) {
    const typeLabel = planType === 'memorization' ? '📝 خطة الحفظ' : '🔄 خطة المراجعة';
    const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

    const daysHTML = days.map((d, i) => {
        const dn = dayNames[new Date(d.date + 'T00:00:00').getDay()];
        const desc = formatPlanDayDesc(d.plannedSections);
        const isGap = gaps.some(g => g.dayIndex === i);
        return `<div class="flex gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 ${isGap ? 'bg-amber-50/70 dark:bg-amber-900/10 -mx-1 px-1 rounded' : ''}">
            <div class="text-center shrink-0 w-12">
                <p class="text-[10px] font-bold text-gray-400">${dn}</p>
                <p class="text-xs font-bold text-gray-600 dark:text-gray-300">${d.date.slice(5)}</p>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-gray-700 dark:text-gray-200 leading-relaxed">${desc}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">ص${d.startPage}-${d.endPage}</p>
            </div>
            <span class="text-[10px] text-gray-300 dark:text-gray-600 shrink-0 self-center">${i+1}</span>
        </div>`;
    }).join('');

    const gapWarning = gaps.length > 0 ? `
        <div id="plan-gap-warning" class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
            <p class="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>
                يوجد ${gaps.length} فجوة في الخطة
            </p>
            <p class="text-xs text-amber-600 dark:text-amber-500 mt-1 mb-3">الأيام المحددة باللون لها انقطاع في الترتيب. هل تريد المتابعة؟</p>
            <button onclick="_cpConfirmGaps()" class="w-full py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition">
                موافق على الفجوات والمتابعة
            </button>
        </div>` : '';

    let modal = document.getElementById('plan-preview-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'plan-preview-modal'; document.body.appendChild(modal); }
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]">
            <div class="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
                <div>
                    <h3 class="font-bold text-lg text-emerald-700 dark:text-emerald-400">${typeLabel}</h3>
                    <p class="text-xs text-gray-400 mt-0.5">${days.length} يوم دراسي · ${pagesLabel || ''}</p>
                </div>
                <button onclick="document.getElementById('plan-preview-modal').remove()" class="text-gray-400 p-2 rounded-full bg-gray-50 dark:bg-gray-700 hover:text-gray-600 transition">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-5 overflow-y-auto flex-1">
                ${gapWarning}
                <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 mb-4 text-xs space-y-1.5">
                    <div class="flex justify-between"><span class="text-gray-500">من:</span><span class="font-bold">${days[0]?.date}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">إلى:</span><span class="font-bold">${days[days.length-1]?.date}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">عدد أيام الدراسة:</span><span class="font-bold">${days.length} يوم</span></div>
                </div>
                <div>${daysHTML}</div>
            </div>
            <div class="p-5 border-t border-gray-100 dark:border-gray-700 shrink-0 grid grid-cols-2 gap-3">
                <button onclick="document.getElementById('plan-preview-modal').remove()" class="py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition">تعديل</button>
                <button id="plan-save-btn" onclick="_cpSavePlan()" class="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition flex items-center justify-center gap-2 ${gaps.length > 0 ? 'opacity-40 pointer-events-none' : ''}">
                    <i data-lucide="save" class="w-4 h-4"></i> حفظ الخطة
                </button>
            </div>
        </div>`;
    lucide.createIcons();
}

window._cpConfirmGaps = function() {
    document.getElementById('plan-gap-warning')?.remove();
    const btn = document.getElementById('plan-save-btn');
    if (btn) { btn.classList.remove('opacity-40', 'pointer-events-none'); }
};


window._cpSavePlan = async function() {
    const data = window._planPreviewData;
    if (!data) return;
    const btn = document.getElementById('plan-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> جاري الحفظ...'; lucide.createIcons(); }
    try {
        for (const sid of data.studentIds) {
            await saveStudentPlanToDB({
                studentId: sid, planType: data.planType,
                startDate: data.startDate, endDate: data.endDate,
                startSura: data.startSura, startAyah: data.startAyah,
                endSura: data.endSura, endAyah: data.endAyah,
                pagesPerDay: data.pagesPerDay
            }, data.days);
        }
        const n = data.studentIds.length;
        showToast(`تم حفظ ${n === 1 ? 'الخطة' : n + ' خطط'} بنجاح ✓`, 'success');
        document.getElementById('plan-preview-modal')?.remove();
        document.getElementById('create-plan-modal')?.remove();
        if (state.currentView === 'plans') await _loadAllPlans();
    } catch(e) {
        console.error('save plan:', e);
        showToast('حدث خطأ أثناء حفظ الخطة', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> حفظ الخطة'; lucide.createIcons(); }
    }
};

// === 6. PLAN TRACKING IN RATE STUDENT MODAL ===

async function loadPlanTrackingForStudent(studentId, dateStr) {
    const planBlock = document.getElementById('rate-quran-plan-display');
    const quranSec = document.getElementById('rate-quran-section');
    if (!planBlock) return;
    planBlock.innerHTML = '<div class="flex justify-center py-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-600"></i></div>';
    planBlock.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();

    try {
        const entries = await getStudentPlanEntriesForDate(studentId, dateStr);
        
        // Hide manual boxes if student has active plans, regardless of today's entries
        const qPlans = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, 'student_plans'),
            window.firebaseOps.where('student_id', '==', studentId),
            window.firebaseOps.where('status', '==', 'active')
        );
        const plansSnap = await window.firebaseOps.getDocs(qPlans);
        const activePlans = plansSnap.docs.map(d => d.data());

        const hasHifzPlan = activePlans.some(p => p.planType === 'memorization' || p.plan_type === 'memorization');
        const hasReviewPlan = activePlans.some(p => p.planType === 'review' || p.plan_type === 'review');

        const hBox = document.getElementById('rate-quran-hifz-box');
        const rBox = document.getElementById('rate-quran-review-box');
        if (quranSec) {
            quranSec.classList.remove('hidden');
            if (hasHifzPlan && hBox) hBox.classList.add('hidden'); else if (hBox) hBox.classList.remove('hidden');
            if (hasReviewPlan && rBox) rBox.classList.add('hidden'); else if (rBox) rBox.classList.remove('hidden');
            if (hasHifzPlan && hasReviewPlan) quranSec.classList.add('hidden');
        }

        if (entries.length === 0) {
            planBlock.classList.add('hidden');
            planBlock.innerHTML = '';
            return;
        }

        window._currentPlanEntries = entries;

        let html = '<div class="space-y-3">';
        for (const { record: rec, plan } of entries) {
            const typeColor = plan.planType === 'memorization' ? 'emerald' : 'purple';
            const typeLabel = plan.planType === 'memorization' ? '📝 خطة الحفظ' : '🔄 خطة المراجعة';
            const desc = formatPlanDayDesc(rec.plannedSections || []);
            const done = rec.status === 'completed';
            const diff = rec.status === 'different';
            const absent = rec.status === 'absent';

            html += `
            <div class="bg-${typeColor}-50 dark:bg-${typeColor}-900/20 border border-${typeColor}-200 dark:border-${typeColor}-700 rounded-xl p-3">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-${typeColor}-700 dark:text-${typeColor}-400">${typeLabel}</span>
                    ${done ? '<span class="text-xs font-bold px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg">✅ تمت</span>' : ''}
                    ${diff ? '<span class="text-xs font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg">⚡ جزئي</span>' : ''}
                    ${absent ? '<span class="text-xs font-bold px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">❌ غياب</span>' : ''}
                </div>
                <p class="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1 leading-relaxed">${desc}</p>
                <div class="flex justify-between items-center mb-3">
                    <p class="text-[10px] text-gray-400">ص${rec.plannedStartPage || '?'} - ${rec.plannedEndPage || '?'}</p>
                    <button onclick="window.openWardReader('${rec.plannedStartSura||1}','${rec.plannedStartAyah||1}','${rec.plannedEndSura||rec.plannedStartSura||1}','${rec.plannedEndAyah||1}')" class="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1"><i data-lucide="book-open" class="w-3 h-3"></i> قراءة الورد</button>
                </div>
                ${!done && !diff && !absent ? `
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="_planMarkDone('${rec.id}','${plan.id}','${studentId}','${dateStr}')"
                        class="py-2.5 rounded-xl bg-${typeColor}-600 hover:bg-${typeColor}-700 text-white font-bold text-xs transition flex items-center justify-center gap-1">
                        <i data-lucide="check" class="w-3.5 h-3.5"></i> تمت الخطة
                    </button>
                    <button onclick="_planShowIncomplete('${rec.id}','${plan.id}','${studentId}','${dateStr}')"
                        class="py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400 font-bold text-xs transition hover:bg-amber-100 dark:hover:bg-amber-900/30">
                        لم تتم
                    </button>
                </div>` : `
                <button onclick="_planUndoDone('${rec.id}','${studentId}','${dateStr}')" class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">تراجع عن الحالة</button>`}
            </div>`;
        }
        html += '</div>';
        planBlock.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    } catch(e) {
        console.error('plan tracking:', e);
        planBlock.classList.add('hidden');
        if (quranSec) {
            quranSec.classList.remove('hidden');
            const hBox = document.getElementById('rate-quran-hifz-box');
            const rBox = document.getElementById('rate-quran-review-box');
            if (hBox) hBox.classList.remove('hidden');
            if (rBox) rBox.classList.remove('hidden');
        }
    }
}

window._planMarkDone = async function(recordId, planId, studentId, date) {
    try {
        const entry = (window._currentPlanEntries || []).find(e => e.record.id === recordId);
        if (!entry) return;
        const rec = entry.record;
        await window.firebaseOps.updateDoc(
            window.firebaseOps.doc(window.db, 'plan_daily_records', recordId), {
                status: 'completed',
                actual_start_sura: rec.planned_start_sura, actual_start_ayah: rec.planned_start_ayah,
                actual_end_sura: rec.planned_end_sura, actual_end_ayah: rec.planned_end_ayah,
                actual_sections: rec.planned_sections || [],
                updatedAt: new Date().toISOString()
            });
        showToast('تم تسجيل إنجاز الورد ✓', 'success');
        await loadPlanTrackingForStudent(studentId, date);
    } catch(e) { showToast('حدث خطأ', 'error'); }
};

window._planUndoDone = async function(recordId, studentId, date) {
    try {
        // Fetch the current day's record
        const recDoc = await window.firebaseOps.getDoc(
            window.firebaseOps.doc(window.db, 'plan_daily_records', recordId));
        if (!recDoc.exists()) return;
        const recData = recDoc.data();
        const planId = recData.plan_id || recData.planId;
        if (!planId) { showToast('تعذر إيجاد الخطة', 'error'); return; }

        // Strategy 1: Per-modification snapshot (saved in undo_snapshot on the record itself)
        let snapshot = recData.undo_snapshot || recData.undoSnapshot || null;

        // Strategy 2: Fall back to original_snapshot from student_plans
        if (!snapshot || snapshot.length === 0) {
            const planDoc = await window.firebaseOps.getDoc(
                window.firebaseOps.doc(window.db, 'student_plans', planId));
            if (planDoc.exists()) {
                const planData = planDoc.data();
                snapshot = planData.original_snapshot || planData.originalSnapshot || null;
            }
        }

        if (!snapshot || snapshot.length === 0) {
            showToast('لا توجد نسخة احتياطية للتراجع', 'error');
            return;
        }

        showToast('جاري استعادة الخطة...', 'success');

        // Delete ALL future pending records
        const allRecords = await loadPlanDailyRecords(planId);
        const toDelete = allRecords.filter(r => r.date > date && r.status === 'pending');
        for (const r of toDelete) {
            await window.firebaseOps.deleteDoc(
                window.firebaseOps.doc(window.db, 'plan_daily_records', r.id));
        }

        // Re-insert snapshot records that are after today
        const futureSS = snapshot.filter(s => {
            const d = s.date || s.planned_date;
            return d && d > date;
        });
        for (const s of futureSS) {
            await window.firebaseOps.addDoc(
                window.firebaseOps.collection(window.db, 'plan_daily_records'), {
                    plan_id: planId,
                    student_id: recData.student_id || recData.studentId,
                    date: s.date,
                    planned_start_sura: s.planned_start_sura || s.plannedStartSura,
                    planned_start_ayah: s.planned_start_ayah || s.plannedStartAyah,
                    planned_end_sura: s.planned_end_sura || s.plannedEndSura,
                    planned_end_ayah: s.planned_end_ayah || s.plannedEndAyah,
                    planned_start_page: s.planned_start_page || s.plannedStartPage,
                    planned_end_page: s.planned_end_page || s.plannedEndPage,
                    planned_sections: s.planned_sections || s.plannedSections || [],
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            );
        }

        // Also restore today's own planned data from snapshot if available
        const todaySS = snapshot.find(s => s.date === date);

        // Reset current day status
        const resetData = {
            status: 'pending',
            actual_end_sura: null,
            actual_end_ayah: null,
            actual_start_sura: null,
            actual_start_ayah: null,
            undo_snapshot: null,
            updatedAt: new Date().toISOString()
        };
        // If we have today's original planned data, restore it too
        if (todaySS) {
            resetData.planned_start_sura = todaySS.planned_start_sura || todaySS.plannedStartSura;
            resetData.planned_start_ayah = todaySS.planned_start_ayah || todaySS.plannedStartAyah;
            resetData.planned_end_sura = todaySS.planned_end_sura || todaySS.plannedEndSura;
            resetData.planned_end_ayah = todaySS.planned_end_ayah || todaySS.plannedEndAyah;
            resetData.planned_start_page = todaySS.planned_start_page || todaySS.plannedStartPage;
            resetData.planned_end_page = todaySS.planned_end_page || todaySS.plannedEndPage;
            resetData.planned_sections = todaySS.planned_sections || todaySS.plannedSections || [];
        }
        await window.firebaseOps.updateDoc(
            window.firebaseOps.doc(window.db, 'plan_daily_records', recordId), resetData);

        showToast('تم التراجع واستعادة الخطة ✓', 'success');
        await loadPlanTrackingForStudent(studentId, date);
    } catch(e) { console.error('undo:', e); showToast('حدث خطأ أثناء التراجع', 'error'); }
};

window._planShowIncomplete = function(recordId, planId, studentId, date) {
    const entry = (window._currentPlanEntries || []).find(e => e.record.id === recordId);
    if (!entry) return;
    const rec = entry.record;
    window._piCurrentRec = rec;
    const suras = window.QuranService ? window.QuranService.getSuras() : [];
    const startS = rec.planned_start_sura || rec.plannedStartSura || 1;
    const allowedSuras = suras.filter(s => s.number >= startS && s.number <= (entry.plan.endSura || 114));
    const suraOpts = allowedSuras.map(s => `<option value="${s.number}">${s.name}</option>`).join('');

    let modal = document.getElementById('plan-incomplete-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'plan-incomplete-modal'; document.body.appendChild(modal); }
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl">
            <div class="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg">إلى أين وصل الطالب؟</h3>
                <button onclick="document.getElementById('plan-incomplete-modal').remove()" class="text-gray-400 p-2 rounded-full bg-gray-50 dark:bg-gray-700 hover:text-gray-600 transition">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-5 space-y-3">
                <p class="text-sm text-gray-500 dark:text-gray-400">حدد آخر آية وصل إليها الطالب اليوم</p>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <p class="text-xs text-gray-500 mb-1">السورة</p>
                        <select id="pi-end-sura" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-2 py-2 text-sm focus:outline-none" onchange="_piUpdateAyahs()">${suraOpts}</select>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 mb-1">الآية</p>
                        <select id="pi-end-ayah" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-2 py-2 text-sm focus:outline-none"><option value="1">1</option></select>
                    </div>
                </div>
            </div>
            <div class="px-5 pb-5 space-y-2">
                <button onclick="_piSubmit('${recordId}','${planId}','${studentId}','${date}','${rec.plannedEndSura || 1}','${rec.plannedEndAyah || 1}')"
                    class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition">تأكيد</button>
                <button onclick="document.getElementById('plan-incomplete-modal').remove()" class="w-full py-2 text-gray-400 hover:text-gray-600 text-sm">إلغاء</button>
            </div>
        </div>`;
    const piSura = document.getElementById('pi-end-sura');
    const startA = rec.planned_start_ayah || rec.plannedStartAyah || 1;
    if (piSura) {
        piSura.value = startS;
        _piUpdateAyahs();
        document.getElementById('pi-end-ayah').value = startA;
    }
    lucide.createIcons();
};

window._piUpdateAyahs = function() {
    const sno = parseInt(document.getElementById('pi-end-sura')?.value || 1);
    const sel = document.getElementById('pi-end-ayah');
    if (!sel || !window.QuranService) return;
    let ayahs = window.QuranService.getAyahs(sno).filter(a => a.aya_no > 0).sort((a, b) => a.aya_no - b.aya_no);
    const entry = (window._currentPlanEntries || []).find(e => e.record.id === window._piCurrentRec?.id);
    if (entry && entry.plan && sno === entry.plan.endSura) {
        const endAy = entry.plan.endAyah || 9999;
        ayahs = ayahs.filter(a => a.aya_no <= endAy);
    }
    sel.innerHTML = ayahs.map(a => `<option value="${a.aya_no}">${a.aya_no}</option>`).join('');
};

window._piSubmit = async function(recordId, planId, studentId, date, plannedEndSura, plannedEndAyah) {
    const eSura = parseInt(document.getElementById('pi-end-sura')?.value);
    const eAyah = parseInt(document.getElementById('pi-end-ayah')?.value);
    if (!eSura || !eAyah) { showToast('يرجى تحديد آخر آية', 'error'); return; }
    document.getElementById('plan-incomplete-modal')?.remove();

    await window.firebaseOps.updateDoc(
        window.firebaseOps.doc(window.db, 'plan_daily_records', recordId), {
            status: 'different', actual_end_sura: eSura, actual_end_ayah: eAyah,
            updatedAt: new Date().toISOString()
        });

    const actualPos = eSura * 10000 + eAyah;
    const plannedPos = parseInt(plannedEndSura) * 10000 + parseInt(plannedEndAyah);

    if (actualPos >= plannedPos) {
        // Did MORE than planned → lighten future days automatically
        showToast('أنجز أكثر من المطلوب! جاري تحديث الخطة...', 'success');
        await redistributeStudentPlan(planId, date, eSura, eAyah, 'distribute');
        await loadPlanTrackingForStudent(studentId, date);
    } else {
        // Did LESS → show rollover/distribute choice
        _showRedistributeOptions(planId, studentId, date, eSura, eAyah);
    }
};

function _showRedistributeOptions(planId, studentId, date, eSura, eAyah) {
    let modal = document.getElementById('redistribute-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'redistribute-modal'; document.body.appendChild(modal); }
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl text-center p-6">
            <div class="bg-amber-100 dark:bg-amber-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 dark:text-amber-400">
                <i data-lucide="alert-circle" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">الورد لم يكتمل</h3>
            <p class="text-gray-500 dark:text-gray-400 text-sm mb-6">كيف تريد التعامل مع الجزء المتبقي من الورد؟</p>
            <div class="space-y-3">
                <button onclick="_doRedistribute('${planId}','${studentId}','${date}','${eSura}','${eAyah}','rollover')"
                    class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                    <i data-lucide="arrow-right" class="w-4 h-4"></i> ترحيل الباقي لليوم التالي
                </button>
                <button onclick="_doRedistribute('${planId}','${studentId}','${date}','${eSura}','${eAyah}','distribute')"
                    class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                    <i data-lucide="git-branch" class="w-4 h-4"></i> تقسيم على باقي أيام الخطة
                </button>
                <button onclick="document.getElementById('redistribute-modal').remove()" class="w-full py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">إلغاء</button>
            </div>
        </div>`;
    lucide.createIcons();
}

window._doRedistribute = async function(planId, studentId, date, eSura, eAyah, mode) {
    document.getElementById('redistribute-modal')?.remove();
    showToast('جاري تعديل الخطة...', 'success');
    await redistributeStudentPlan(planId, date, parseInt(eSura), parseInt(eAyah), mode);
    showToast('تم تعديل الخطة بنجاح ✓', 'success');
    await loadPlanTrackingForStudent(studentId, date);
};

// === 7. ABSENCE INTEGRATION ===

async function checkPlanBeforeAbsence(studentId, date, onContinue) {
    try {
        const entries = await getStudentPlanEntriesForDate(studentId, date);
        if (entries.length === 0) { onContinue(); return; }

        const planSummary = entries.map(e => {
            const typeLabel = e.plan.planType === 'memorization' ? '📝 حفظ' : '🔄 مراجعة';
            return `<p class="text-xs text-gray-600 dark:text-gray-300"><b>${typeLabel}:</b> ${formatPlanDayDesc(e.record.planned_sections || [])}</p>`;
        }).join('');

        window._absencePlanEntries = entries;
        window._absenceOnContinue = onContinue;

        let modal = document.getElementById('absence-plan-modal');
        if (!modal) { modal = document.createElement('div'); modal.id = 'absence-plan-modal'; document.body.appendChild(modal); }
        modal.className = 'fixed inset-0 bg-black/70 z-[500] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl text-center p-6">
                <div class="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600 dark:text-orange-400">
                    <i data-lucide="calendar-x" class="w-8 h-8"></i>
                </div>
                <h3 class="font-bold text-lg mb-1">للطالب ورد اليوم!</h3>
                <p class="text-gray-500 dark:text-gray-400 text-sm mb-3">ماذا تريد أن تفعل بورد الخطة؟</p>
                <div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-right mb-5 space-y-1">${planSummary}</div>
                <div class="space-y-2">
                    <button onclick="_absencePlanDecide('rollover')"
                        class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                        <i data-lucide="arrow-right" class="w-4 h-4"></i> ترحيل الورد لليوم التالي
                    </button>
                    <button onclick="_absencePlanDecide('distribute')"
                        class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                        <i data-lucide="git-branch" class="w-4 h-4"></i> تقسيم على باقي الخطة
                    </button>
                    <button onclick="_absencePlanSkip()" class="w-full py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm border border-gray-200 dark:border-gray-600 rounded-xl transition">
                        تجاهل الورد والمتابعة
                    </button>
                    <button onclick="document.getElementById('absence-plan-modal').remove()" class="w-full py-1.5 text-gray-400 hover:text-gray-600 text-xs">إلغاء</button>
                </div>
            </div>`;
        lucide.createIcons();
    } catch(e) { console.error('check plan absence:', e); onContinue(); }
}

window._absencePlanDecide = async function(mode) {
    document.getElementById('absence-plan-modal')?.remove();
    const entries = window._absencePlanEntries || [];
    const onContinue = window._absenceOnContinue || (() => {});
    for (const { record: rec, plan } of entries) {
        try {
            await window.firebaseOps.updateDoc(
                window.firebaseOps.doc(window.db, 'plan_daily_records', rec.id),
                { status: 'absent', updatedAt: new Date().toISOString() });
            await redistributeStudentPlan(plan.id, rec.date, null, null, mode);
        } catch(e) { console.error('absence plan decide:', e); }
    }
    showToast('تم تعديل خطة الطالب الغائب ✓', 'success');
    onContinue();
};

window._absencePlanSkip = function() {
    document.getElementById('absence-plan-modal')?.remove();
    (window._absenceOnContinue || (() => {}))();
};

// === 8. PLAN SCHEDULE VIEWER + DELETE ===

window.viewPlanSchedule = async function(planId) {
    showToast('جاري تحميل الجدول...', 'success');
    try {
        const records = await loadPlanDailyRecords(planId);
        if (records.length === 0) { showToast('لا توجد سجلات لهذه الخطة', 'error'); return; }

        const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const today = new Date().toISOString().split('T')[0];
        const statusMap = {
            pending:   ['⏳','text-gray-400'],
            completed: ['✅','text-green-600'],
            different: ['⚡','text-amber-600'],
            absent:    ['❌','text-red-600']
        };

        const rowsHTML = records.map(r => {
            const dn = dayNames[new Date(r.date + 'T00:00:00').getDay()];
            const desc = formatPlanDayDesc(r.plannedSections || []);
            const [icon, color] = statusMap[r.status] || ['⏳','text-gray-400'];
            const isToday = r.date === today;
            return `<div class="flex gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 ${isToday ? 'bg-emerald-50/50 dark:bg-emerald-900/10 -mx-1 px-1 rounded' : ''}">
                <div class="text-center shrink-0 w-14">
                    <p class="text-[10px] font-bold text-gray-400">${dn}</p>
                    <p class="text-xs font-bold ${isToday ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-300'}">${r.date.slice(5)}</p>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">${desc}</p>
                    <p class="text-[10px] text-gray-400">ص${r.plannedStartPage||'?'}-${r.plannedEndPage||'?'}</p>
                </div>
                <div class="flex flex-col items-center gap-1 shrink-0 self-center">
                    <span class="${color} text-sm">${icon}</span>
                    <button onclick="window.openWardReader('${r.plannedStartSura||1}','${r.plannedStartAyah||1}','${r.plannedEndSura||r.plannedStartSura||1}','${r.plannedEndAyah||1}')" class="text-[10px] text-emerald-600 hover:text-emerald-800 leading-none p-0.5 font-bold" title="قراءة الورد">📖 قراءة</button>
                </div>
            </div>`;
        }).join('');

        let modal = document.getElementById('plan-schedule-modal');
        if (!modal) { modal = document.createElement('div'); modal.id = 'plan-schedule-modal'; document.body.appendChild(modal); }
        modal.className = 'fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
                <div class="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
                    <div>
                        <h3 class="font-bold text-lg text-emerald-700 dark:text-emerald-400">الجدول الكامل</h3>
                        <p class="text-xs text-gray-400">${records.length} يوم</p>
                    </div>
                    <button onclick="document.getElementById('plan-schedule-modal').remove()" class="text-gray-400 p-2 rounded-full bg-gray-50 dark:bg-gray-700 hover:text-gray-600 transition">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>
                <div class="px-5 py-3 border-b border-gray-50 dark:border-gray-700 shrink-0 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>⏳ معلق</span><span>✅ أنجز</span><span>⚡ جزئي</span><span>❌ غياب</span>
                </div>
                <div class="p-5 overflow-y-auto flex-1">${rowsHTML}</div>
            </div>`;
        lucide.createIcons();
    } catch(e) { showToast('حدث خطأ في تحميل الجدول', 'error'); }
};


window.openWardReader = function(startSura, startAyah, endSura, endAyah) {
    startSura = parseInt(startSura) || 1;
    startAyah = parseInt(startAyah) || 1;
    endSura = parseInt(endSura) || startSura;
    if (!window.QuranService || !window.QuranService.isLoaded()) {
        showToast('بيانات القرآن غير محملة', 'error'); return;
    }
    // Resolve 9999 → actual last ayah of the endSura
    const endSuraAllAyahs = window.QuranService.getAyahs(endSura).filter(a => a.aya_no > 0).sort((a, b) => a.aya_no - b.aya_no);
    const realEndAyah = (!endAyah || parseInt(endAyah) >= 9000) ? (endSuraAllAyahs[endSuraAllAyahs.length - 1]?.aya_no || 1) : parseInt(endAyah);

    // Collect ayahs in range
    const ayahs = [];
    const suras = window.QuranService.getSuras();
    for (const sura of suras) {
        if (sura.number < startSura) continue;
        if (sura.number > endSura) break;
        const suraAyahs = window.QuranService.getAyahs(sura.number)
            .filter(a => a.aya_no > 0)
            .sort((a, b) => a.aya_no - b.aya_no);
        for (const a of suraAyahs) {
            if (sura.number === startSura && a.aya_no < startAyah) continue;
            if (sura.number === endSura && a.aya_no > realEndAyah) continue;
            ayahs.push(a);
        }
    }
    if (ayahs.length === 0) { showToast('لا توجد آيات في النطاق المحدد', 'error'); return; }

    // Group ayahs by sura
    const bySura = {};
    ayahs.forEach(a => {
        if (!bySura[a.sura_no]) bySura[a.sura_no] = { name: a.sura_name_ar, ayahs: [] };
        bySura[a.sura_no].ayahs.push(a);
    });

    let contentHTML = '';
    for (const sno of Object.keys(bySura).sort((a,b) => a-b)) {
        const sg = bySura[sno];
        contentHTML += `<div class="mb-5">
            <h4 class="text-center font-bold text-emerald-700 dark:text-emerald-400 text-sm mb-2 pb-1 border-b border-emerald-100 dark:border-emerald-800">سورة ${sg.name}</h4>
            <div class="text-right leading-loose text-gray-800 dark:text-gray-100" dir="rtl" style="font-family:'UthmanicHafs','Noto Naskh Arabic',serif;font-size:20px;line-height:2.4;">${sg.ayahs.map(a => `<span>${a.aya_text} ﴿${a.aya_no}﴾</span>`).join(' ')}</div>
        </div>`;
    }

    let modal = document.getElementById('ward-reader-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'ward-reader-modal'; document.body.appendChild(modal); }
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">
            <div class="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
                <div>
                    <h3 class="font-bold text-emerald-700 dark:text-emerald-400">📖 قراءة الورد</h3>
                    <p class="text-xs text-gray-400 mt-0.5">${ayahs.length} آية</p>
                </div>
                <button onclick="document.getElementById('ward-reader-modal').remove()" class="text-gray-400 p-2 rounded-full bg-gray-50 dark:bg-gray-700 hover:text-gray-600 transition">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-5 overflow-y-auto flex-1">${contentHTML}</div>
        </div>`;
    lucide.createIcons();
};

window.confirmDeletePlan = function(planId) {
    // Use custom confirm to avoid alert()
    let modal = document.getElementById('confirm-delete-plan-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'confirm-delete-plan-modal'; document.body.appendChild(modal); }
    modal.className = 'fixed inset-0 bg-black/70 z-[350] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xs shadow-2xl text-center p-6">
            <div class="bg-red-100 dark:bg-red-900/30 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                <i data-lucide="trash-2" class="w-7 h-7"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">حذف الخطة</h3>
            <p class="text-gray-500 dark:text-gray-400 text-sm mb-5">سيتم حذف الخطة وجميع سجلاتها. لا يمكن التراجع.</p>
            <div class="grid grid-cols-2 gap-3">
                <button onclick="document.getElementById('confirm-delete-plan-modal').remove()" class="py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition">إلغاء</button>
                <button onclick="_deletePlan('${planId}')" class="py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition">حذف</button>
            </div>
        </div>`;
    lucide.createIcons();
};

async function _deletePlan(planId) {
    document.getElementById('confirm-delete-plan-modal')?.remove();
    try {
        showToast('جاري الحذف...', 'success');
        const recQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, 'plan_daily_records'),
            window.firebaseOps.where('plan_id', '==', planId));
        const recSnap = await window.firebaseOps.getDocs(recQ);
        for (const d of recSnap.docs) {
            await window.firebaseOps.deleteDoc(
                window.firebaseOps.doc(window.db, 'plan_daily_records', d.id));
        }
        await window.firebaseOps.deleteDoc(
            window.firebaseOps.doc(window.db, 'student_plans', planId));
        showToast('تم حذف الخطة ✓', 'success');
        if (state.currentView === 'plans') await _loadAllPlans();
    } catch(e) { showToast('حدث خطأ أثناء الحذف', 'error'); }
}

// ====================================================
// END: نظام الخطط المرن
// ====================================================
