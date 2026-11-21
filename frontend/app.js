/**
 * CloudStudent Frontend Application Logic
 * Communicates with Backend REST API through NGINX Reverse Proxy
 */

// API Endpoints
const API_BASE = '/api/students';
const HEALTH_URL = '/health';

// Global State
let currentStudents = [];
let studentToEdit = null;
let studentToDelete = null;
let searchDebounceTimer = null;

// DOM Elements
const studentsTableBody = document.getElementById('studentsTableBody');
const recordCountText = document.getElementById('recordCountText');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const courseFilter = document.getElementById('courseFilter');
const semesterFilter = document.getElementById('semesterFilter');
const refreshBtn = document.getElementById('refreshBtn');

// Modals
const studentModal = document.getElementById('studentModal');
const modalTitle = document.getElementById('modalTitle');
const studentForm = document.getElementById('studentForm');
const openAddModalBtn = document.getElementById('openAddModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const saveStudentBtn = document.getElementById('saveStudentBtn');

const deleteModal = document.getElementById('deleteModal');
const deleteStudentName = document.getElementById('deleteStudentName');
const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// Stats Elements
const statTotalStudents = document.getElementById('statTotalStudents');
const statActiveCourses = document.getElementById('statActiveCourses');
const statTopCourse = document.getElementById('statTopCourse');
const healthIndicator = document.getElementById('healthIndicator');
const healthStatusText = document.getElementById('healthStatusText');

// Form Inputs
const studentIdInput = document.getElementById('studentId');
const fullNameInput = document.getElementById('fullName');
const enrollmentNoInput = document.getElementById('enrollmentNo');
const emailInput = document.getElementById('email');
const courseInput = document.getElementById('course');
const semesterInput = document.getElementById('semester');

// Error Small Elements
const fullNameError = document.getElementById('fullNameError');
const enrollmentNoError = document.getElementById('enrollmentNoError');
const emailError = document.getElementById('emailError');
const courseError = document.getElementById('courseError');
const semesterError = document.getElementById('semesterError');

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkHealth();
  fetchStats();
  fetchStudents();

  // Periodic health check every 20 seconds
  setInterval(checkHealth, 20000);
});

function setupEventListeners() {
  // Search and Filters
  searchInput.addEventListener('input', handleSearchInput);
  clearSearchBtn.addEventListener('click', clearSearch);
  courseFilter.addEventListener('change', () => fetchStudents());
  semesterFilter.addEventListener('change', () => fetchStudents());
  refreshBtn.addEventListener('click', () => {
    fetchStats();
    fetchStudents();
    checkHealth();
    showToast('Refreshed student data', 'info');
  });

  // Modal Controls
  openAddModalBtn.addEventListener('click', openAddModal);
  closeModalBtn.addEventListener('click', closeStudentModal);
  cancelModalBtn.addEventListener('click', closeStudentModal);
  studentForm.addEventListener('submit', handleFormSubmit);

  closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
  cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  confirmDeleteBtn.addEventListener('click', executeDeleteStudent);

  // Close modals on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStudentModal();
      closeDeleteModal();
    }
  });

  // Close modal when clicking backdrop
  studentModal.addEventListener('click', (e) => {
    if (e.target === studentModal) closeStudentModal();
  });
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });
}

// ============================================================================
// Health Check
// ============================================================================
async function checkHealth() {
  try {
    const res = await fetch(HEALTH_URL);
    if (!res.ok) throw new Error('API returned non-200');
    const data = await res.json();

    if (data.status === 'healthy' && data.database.status === 'connected') {
      healthIndicator.className = 'health-badge connected';
      healthStatusText.textContent = 'API & DB Connected';
    } else {
      healthIndicator.className = 'health-badge connecting';
      healthStatusText.textContent = 'DB Initializing...';
    }
  } catch (err) {
    healthIndicator.className = 'health-badge disconnected';
    healthStatusText.textContent = 'API Disconnected';
  }
}

// ============================================================================
// Stats Fetching
// ============================================================================
async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    const result = await res.json();
    if (result.success) {
      const { totalStudents, courseStats } = result.data;
      statTotalStudents.textContent = totalStudents;
      statActiveCourses.textContent = courseStats ? courseStats.length : 0;
      if (courseStats && courseStats.length > 0) {
        statTopCourse.textContent = `${courseStats[0]._id} (${courseStats[0].count})`;
        statTopCourse.title = `${courseStats[0]._id} with ${courseStats[0].count} students`;
      } else {
        statTopCourse.textContent = 'None';
      }
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// ============================================================================
// Students Fetching & Rendering
// ============================================================================
function handleSearchInput() {
  const query = searchInput.value.trim();
  clearSearchBtn.style.display = query ? 'block' : 'none';

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchStudents();
  }, 300);
}

function clearSearch() {
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  fetchStudents();
}

async function fetchStudents() {
  renderLoadingState();

  const search = encodeURIComponent(searchInput.value.trim());
  const course = encodeURIComponent(courseFilter.value);
  const semester = encodeURIComponent(semesterFilter.value);

  const url = `${API_BASE}?search=${search}&course=${course}&semester=${semester}`;

  try {
    const res = await fetch(url);
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch students');
    }

    currentStudents = result.data || [];
    renderStudentsTable(currentStudents);
    recordCountText.textContent = `Showing ${currentStudents.length} of ${result.total || currentStudents.length} registered students`;
  } catch (error) {
    console.error('Fetch students error:', error);
    renderErrorState(error.message);
  }
}

function renderLoadingState() {
  studentsTableBody.innerHTML = `
    <tr class="placeholder-row">
      <td colspan="7" class="loading-state">
        <div class="spinner"></div>
        <p>Fetching records from cluster...</p>
      </td>
    </tr>
  `;
}

function renderErrorState(message) {
  studentsTableBody.innerHTML = `
    <tr class="placeholder-row">
      <td colspan="7" class="empty-state">
        <p style="color: var(--danger-color); font-weight: 600;">Unable to connect to Student API</p>
        <p style="font-size: 0.85rem;">${escapeHtml(message)}</p>
      </td>
    </tr>
  `;
}

function renderStudentsTable(students) {
  if (!students || students.length === 0) {
    studentsTableBody.innerHTML = `
      <tr class="placeholder-row">
        <td colspan="7" class="empty-state">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin: 0 auto; color: var(--text-muted);">
            <path d="M12 14l9-5-9-5-9 5 9 5z"></path>
            <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path>
          </svg>
          <p>No student records found matching criteria.</p>
        </td>
      </tr>
    `;
    return;
  }

  studentsTableBody.innerHTML = students.map((student) => {
    const initials = student.fullName
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const formattedDate = new Date(student.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return `
      <tr data-id="${student.id}">
        <td>
          <div class="student-meta">
            <div class="avatar-circle">${escapeHtml(initials)}</div>
            <div class="student-name">${escapeHtml(student.fullName)}</div>
          </div>
        </td>
        <td>
          <span class="enrollment-tag">${escapeHtml(student.enrollmentNo)}</span>
        </td>
        <td>${escapeHtml(student.email)}</td>
        <td>
          <span class="course-badge">${escapeHtml(student.course)}</span>
        </td>
        <td>
          <span class="semester-badge">Sem ${student.semester}</span>
        </td>
        <td>${formattedDate}</td>
        <td class="text-right">
          <button class="btn btn-action-edit" onclick="openEditModal('${student.id}')">Edit</button>
          <button class="btn btn-action-delete" onclick="openDeleteModal('${student.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================================================
// Add & Edit Student Form Logic
// ============================================================================
function openAddModal() {
  studentToEdit = null;
  modalTitle.textContent = 'Register New Student';
  saveStudentBtn.querySelector('.btn-text').textContent = 'Save Student';
  resetFormErrors();
  studentForm.reset();
  studentIdInput.value = '';
  enrollmentNoInput.disabled = false;
  studentModal.classList.add('show');
  fullNameInput.focus();
}

function openEditModal(id) {
  const student = currentStudents.find((s) => s.id === id);
  if (!student) return;

  studentToEdit = student;
  modalTitle.textContent = 'Edit Student Details';
  saveStudentBtn.querySelector('.btn-text').textContent = 'Update Record';
  resetFormErrors();

  studentIdInput.value = student.id;
  fullNameInput.value = student.fullName;
  enrollmentNoInput.value = student.enrollmentNo;
  enrollmentNoInput.disabled = false;
  emailInput.value = student.email;
  courseInput.value = student.course;
  semesterInput.value = student.semester;

  studentModal.classList.add('show');
  fullNameInput.focus();
}

function closeStudentModal() {
  studentModal.classList.remove('show');
  studentToEdit = null;
}

function resetFormErrors() {
  [fullNameInput, enrollmentNoInput, emailInput, courseInput, semesterInput].forEach((el) => {
    el.classList.remove('is-invalid');
  });
  fullNameError.textContent = '';
  enrollmentNoError.textContent = '';
  emailError.textContent = '';
  courseError.textContent = '';
  semesterError.textContent = '';
}

function validateForm() {
  resetFormErrors();
  let isValid = true;

  // Name validation
  const name = fullNameInput.value.trim();
  if (!name || name.length < 3) {
    fullNameInput.classList.add('is-invalid');
    fullNameError.textContent = 'Name must be at least 3 characters long.';
    isValid = false;
  }

  // Enrollment validation
  const enrollment = enrollmentNoInput.value.trim();
  const enrollmentRegex = /^[A-Za-z0-9\-_]{4,20}$/;
  if (!enrollment || !enrollmentRegex.test(enrollment)) {
    enrollmentNoInput.classList.add('is-invalid');
    enrollmentNoError.textContent = '4-20 alphanumeric characters (hyphens allowed).';
    isValid = false;
  }

  // Email validation
  const email = emailInput.value.trim();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email)) {
    emailInput.classList.add('is-invalid');
    emailError.textContent = 'Please enter a valid email address.';
    isValid = false;
  }

  // Course validation
  if (!courseInput.value) {
    courseInput.classList.add('is-invalid');
    courseError.textContent = 'Please select a course.';
    isValid = false;
  }

  // Semester validation
  if (!semesterInput.value) {
    semesterInput.classList.add('is-invalid');
    semesterError.textContent = 'Please select a semester.';
    isValid = false;
  }

  return isValid;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const payload = {
    fullName: fullNameInput.value.trim(),
    enrollmentNo: enrollmentNoInput.value.trim().toUpperCase(),
    email: emailInput.value.trim().toLowerCase(),
    course: courseInput.value,
    semester: Number(semesterInput.value)
  };

  const isEditing = Boolean(studentToEdit);
  const url = isEditing ? `${API_BASE}/${studentToEdit.id}` : API_BASE;
  const method = isEditing ? 'PUT' : 'POST';

  setFormLoading(true);

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Server error occurred');
    }

    showToast(result.message || 'Saved successfully', 'success');
    closeStudentModal();
    fetchStats();
    fetchStudents();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setFormLoading(false);
  }
}

function setFormLoading(isLoading) {
  saveStudentBtn.disabled = isLoading;
  const btnText = saveStudentBtn.querySelector('.btn-text');
  const spinner = saveStudentBtn.querySelector('.spinner-small');
  if (isLoading) {
    btnText.style.display = 'none';
    spinner.style.display = 'block';
  } else {
    btnText.style.display = 'block';
    spinner.style.display = 'none';
  }
}

// ============================================================================
// Delete Confirmation Logic
// ============================================================================
function openDeleteModal(id) {
  const student = currentStudents.find((s) => s.id === id);
  if (!student) return;

  studentToDelete = student;
  deleteStudentName.textContent = `"${student.fullName}" (${student.enrollmentNo})`;
  deleteModal.classList.add('show');
}

function closeDeleteModal() {
  deleteModal.classList.remove('show');
  studentToDelete = null;
}

async function executeDeleteStudent() {
  if (!studentToDelete) return;

  confirmDeleteBtn.disabled = true;
  confirmDeleteBtn.textContent = 'Deleting...';

  try {
    const res = await fetch(`${API_BASE}/${studentToDelete.id}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || 'Failed to delete student');
    }

    showToast(result.message, 'success');
    closeDeleteModal();
    fetchStats();
    fetchStudents();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.textContent = 'Delete Record';
  }
}

// ============================================================================
// Utilities & Toast Notifications
// ============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button style="background:none;border:none;cursor:pointer;color:inherit;font-weight:bold;">&times;</button>
  `;

  toast.querySelector('button').addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Make functions accessible from onclick HTML
window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;
