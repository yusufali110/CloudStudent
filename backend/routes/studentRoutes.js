const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

/**
 * @route   GET /api/students/stats
 * @desc    Get dashboard metrics and statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();

    // Group count by course
    const courseStats = await Student.aggregate([
      { $group: { _id: '$course', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Group count by semester
    const semesterStats = await Student.aggregate([
      { $group: { _id: '$semester', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Fetch the 5 most recently enrolled students
    const recentStudents = await Student.find()
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        totalStudents,
        courseStats,
        semesterStats,
        recentStudents
      }
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving statistics' });
  }
});

/**
 * @route   GET /api/students
 * @desc    Get all students with search and filter capabilities
 */
router.get('/', async (req, res) => {
  try {
    const { search, course, semester, page = 1, limit = 50 } = req.query;

    const query = {};

    // Filter by course
    if (course && course !== 'All') {
      query.course = course;
    }

    // Filter by semester
    if (semester && semester !== 'All') {
      query.semester = Number(semester);
    }

    // Search by full name or enrollment number (case-insensitive regex)
    if (search && search.trim() !== '') {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { fullName: { $regex: sanitized, $options: 'i' } },
        { enrollmentNo: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      count: students.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
      data: students
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving student list' });
  }
});

/**
 * @route   GET /api/students/:id
 * @desc    Get a single student by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }
    res.json({ success: true, data: student });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid student ID format' });
    }
    res.status(500).json({ success: false, message: 'Server error retrieving student' });
  }
});

/**
 * @route   POST /api/students
 * @desc    Create a new student record
 */
router.post('/', async (req, res) => {
  try {
    const { fullName, enrollmentNo, email, course, semester } = req.body;

    // Check for duplicate enrollment number
    const existingEnrollment = await Student.findOne({
      enrollmentNo: enrollmentNo ? enrollmentNo.trim().toUpperCase() : ''
    });
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: `Student with enrollment number '${enrollmentNo.toUpperCase()}' already exists`
      });
    }

    // Check for duplicate email
    const existingEmail = await Student.findOne({
      email: email ? email.trim().toLowerCase() : ''
    });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: `Student with email '${email.toLowerCase()}' already exists`
      });
    }

    const student = new Student({
      fullName,
      enrollmentNo,
      email,
      course,
      semester
    });

    const savedStudent = await student.save();
    res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      data: savedStudent
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Error creating student:', error);
    res.status(500).json({ success: false, message: 'Failed to create student record' });
  }
});

/**
 * @route   PUT /api/students/:id
 * @desc    Update an existing student record
 */
router.put('/:id', async (req, res) => {
  try {
    const { fullName, enrollmentNo, email, course, semester } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }

    // Check enrollment uniqueness if changed
    if (enrollmentNo && enrollmentNo.toUpperCase() !== student.enrollmentNo) {
      const existingEnrollment = await Student.findOne({
        enrollmentNo: enrollmentNo.trim().toUpperCase()
      });
      if (existingEnrollment) {
        return res.status(400).json({
          success: false,
          message: `Enrollment number '${enrollmentNo.toUpperCase()}' is already in use by another student`
        });
      }
    }

    // Check email uniqueness if changed
    if (email && email.toLowerCase() !== student.email) {
      const existingEmail = await Student.findOne({
        email: email.trim().toLowerCase()
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: `Email '${email.toLowerCase()}' is already in use by another student`
        });
      }
    }

    if (fullName) student.fullName = fullName;
    if (enrollmentNo) student.enrollmentNo = enrollmentNo;
    if (email) student.email = email;
    if (course) student.course = course;
    if (semester) student.semester = semester;

    const updatedStudent = await student.save();
    res.json({
      success: true,
      message: 'Student record updated successfully',
      data: updatedStudent
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid student ID format' });
    }
    console.error('Error updating student:', error);
    res.status(500).json({ success: false, message: 'Failed to update student record' });
  }
});

/**
 * @route   DELETE /api/students/:id
 * @desc    Delete a student record
 */
router.delete('/:id', async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }
    res.json({
      success: true,
      message: `Student '${student.fullName}' (${student.enrollmentNo}) deleted successfully`
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid student ID format' });
    }
    console.error('Error deleting student:', error);
    res.status(500).json({ success: false, message: 'Failed to delete student record' });
  }
});

module.exports = router;
