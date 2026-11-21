const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [3, 'Full name must be at least 3 characters long'],
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    enrollmentNo: {
      type: String,
      required: [true, 'Enrollment number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      match: [/^[A-Za-z0-9\-_]{4,20}$/, 'Enrollment number must be alphanumeric (4-20 characters)']
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please provide a valid email address'
      ]
    },
    course: {
      type: String,
      required: [true, 'Course is required'],
      enum: {
        values: [
          'Computer Science',
          'Cloud Computing',
          'Cyber Security',
          'AI & Data Science',
          'Information Technology',
          'Software Engineering'
        ],
        message: '{VALUE} is not a supported course'
      }
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: [1, 'Semester must be between 1 and 8'],
      max: [8, 'Semester must be between 1 and 8']
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Composite text index for full-text search capability
studentSchema.index({ fullName: 'text', enrollmentNo: 'text' });

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
