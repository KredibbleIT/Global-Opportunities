import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { SeekerProfile } from '../src/models/Profiles.js';

async function insertReviewer() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error('DATABASE_URL not set');

  await mongoose.connect(uri);

  const existing = await User.findOne({ email: 'play-reviewer@kredibble-it.com' });
  if (existing) {
    console.log('Reviewer already exists:', existing.email);
    return;
  }

  const passwordHash = await bcrypt.hash('Reviewer@123', 12);

  const user = new User({
    name: 'Play Reviewer',
    email: 'play-reviewer@kredibble-it.com',
    role: 'seeker',
    passwordHash,
    emailVerified: true,
  });
  await user.save();

  const profile = new SeekerProfile({
    userId: user._id,
    profession: 'App Reviewer',
    university: 'Google Play Console',
    country: 'United States',
    city: 'Mountain View',
    phone: '+1 000 000 0000',
    bio: 'Google Play Console reviewer account for app review access.',
    technicalSkills: '[]',
    softSkills: '[]',
    tools: '[]',
    certifications: '[]',
    status: 'active',
    joinedDate: new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    verified: true,
  });
  await profile.save();

  console.log('✅ Reviewer inserted');
  console.log('Email: play-reviewer@kredibble-it.com');
  console.log('Password: Reviewer@123');
  console.log('User ID:', user._id);

  await mongoose.disconnect();
}

insertReviewer().catch((err) => {
  console.error('❌ Insert failed:', err.message);
  process.exit(1);
});
