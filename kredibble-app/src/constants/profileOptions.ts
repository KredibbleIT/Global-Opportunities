// Option lists for the profile forms (sign-up used to carry them). The seeker lists (universities, programs, skills, career interests) are
// only a starting copy: the app fetches the live lists from the server and falls back to these when it cannot.

export type Country = { name: string; code: string; dialCode: string };

export const getFlag = (code: string) =>
  code.toUpperCase().split('').map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');

export const COUNTRIES: Country[] = [
  { name: 'Afghanistan', code: 'AF', dialCode: '+93' },
  { name: 'Albania', code: 'AL', dialCode: '+355' },
  { name: 'Algeria', code: 'DZ', dialCode: '+213' },
  { name: 'Argentina', code: 'AR', dialCode: '+54' },
  { name: 'Australia', code: 'AU', dialCode: '+61' },
  { name: 'Austria', code: 'AT', dialCode: '+43' },
  { name: 'Bahamas', code: 'BS', dialCode: '+1-242' },
  { name: 'Bangladesh', code: 'BD', dialCode: '+880' },
  { name: 'Belgium', code: 'BE', dialCode: '+32' },
  { name: 'Brazil', code: 'BR', dialCode: '+55' },
  { name: 'Cambodia', code: 'KH', dialCode: '+855' },
  { name: 'Cameroon', code: 'CM', dialCode: '+237' },
  { name: 'Canada', code: 'CA', dialCode: '+1' },
  { name: 'Chile', code: 'CL', dialCode: '+56' },
  { name: 'China', code: 'CN', dialCode: '+86' },
  { name: 'Colombia', code: 'CO', dialCode: '+57' },
  { name: 'Denmark', code: 'DK', dialCode: '+45' },
  { name: 'Ecuador', code: 'EC', dialCode: '+593' },
  { name: 'Egypt', code: 'EG', dialCode: '+20' },
  { name: 'Ethiopia', code: 'ET', dialCode: '+251' },
  { name: 'Fiji', code: 'FJ', dialCode: '+679' },
  { name: 'Finland', code: 'FI', dialCode: '+358' },
  { name: 'France', code: 'FR', dialCode: '+33' },
  { name: 'Germany', code: 'DE', dialCode: '+49' },
  { name: 'Ghana', code: 'GH', dialCode: '+233' },
  { name: 'Greece', code: 'GR', dialCode: '+30' },
  { name: 'Haiti', code: 'HT', dialCode: '+509' },
  { name: 'India', code: 'IN', dialCode: '+91' },
  { name: 'Indonesia', code: 'ID', dialCode: '+62' },
  { name: 'Ireland', code: 'IE', dialCode: '+353' },
  { name: 'Italy', code: 'IT', dialCode: '+39' },
  { name: 'Japan', code: 'JP', dialCode: '+81' },
  { name: 'Kenya', code: 'KE', dialCode: '+254' },
  { name: 'Malaysia', code: 'MY', dialCode: '+60' },
  { name: 'Mexico', code: 'MX', dialCode: '+52' },
  { name: 'Morocco', code: 'MA', dialCode: '+212' },
  { name: 'Netherlands', code: 'NL', dialCode: '+31' },
  { name: 'New Zealand', code: 'NZ', dialCode: '+64' },
  { name: 'Nigeria', code: 'NG', dialCode: '+234' },
  { name: 'Norway', code: 'NO', dialCode: '+47' },
  { name: 'Pakistan', code: 'PK', dialCode: '+92' },
  { name: 'Philippines', code: 'PH', dialCode: '+63' },
  { name: 'Poland', code: 'PL', dialCode: '+48' },
  { name: 'Portugal', code: 'PT', dialCode: '+351' },
  { name: 'Russia', code: 'RU', dialCode: '+7' },
  { name: 'Rwanda', code: 'RW', dialCode: '+250' },
  { name: 'Saudi Arabia', code: 'SA', dialCode: '+966' },
  { name: 'Senegal', code: 'SN', dialCode: '+221' },
  { name: 'Singapore', code: 'SG', dialCode: '+65' },
  { name: 'South Africa', code: 'ZA', dialCode: '+27' },
  { name: 'South Korea', code: 'KR', dialCode: '+82' },
  { name: 'Spain', code: 'ES', dialCode: '+34' },
  { name: 'Sweden', code: 'SE', dialCode: '+46' },
  { name: 'Switzerland', code: 'CH', dialCode: '+41' },
  { name: 'Tanzania', code: 'TZ', dialCode: '+255' },
  { name: 'Thailand', code: 'TH', dialCode: '+66' },
  { name: 'Turkey', code: 'TR', dialCode: '+90' },
  { name: 'Uganda', code: 'UG', dialCode: '+256' },
  { name: 'Ukraine', code: 'UA', dialCode: '+380' },
  { name: 'United Kingdom', code: 'GB', dialCode: '+44' },
  { name: 'United States', code: 'US', dialCode: '+1' },
  { name: 'Vietnam', code: 'VN', dialCode: '+84' },
  { name: 'Zimbabwe', code: 'ZW', dialCode: '+263' },
];

export const UNIVERSITIES = [
  'Ashe University', 'Cairo University', 'Cambridge University',
  'Columbia University', 'Harvard University', 'Johns Hopkins University',
  'Kwame Nkrumah University of Science and Technology',
  'London School of Economics', 'Maker University', 'MIT',
  'National University of Singapore', 'Oxford University', 'Princeton University',
  'Stanford University', 'University of Cape Town', 'University of Ghana',
  'University of Lagos', 'University of Nairobi', 'University of Sydney',
  'University of Toronto', 'Yale University',
];

export const PROGRAMS = [
  'Accounting', 'Agriculture', 'Architecture', 'Business Administration',
  'Chemical Engineering', 'Civil Engineering', 'Computer Science', 'Data Science',
  'Economics', 'Education', 'Electrical Engineering', 'Environmental Science',
  'Finance', 'Information Technology', 'International Relations', 'Law',
  'Marketing', 'Mathematics', 'Mechanical Engineering', 'Medicine',
  'Nursing', 'Pharmacy', 'Psychology', 'Public Health', 'Software Engineering',
];

export const GRADUATION_YEARS = [
  '2020', '2021', '2022', '2023', '2024',
  '2025', '2026', '2027', '2028', '2029', '2030',
];

export const STATUSES = [
  'Undergraduate Student', 'Graduate Student', 'Recent Graduate',
  'Working Professional', 'Unemployed', 'Freelancer',
];

export const SKILLS = [
  'Data Analysis', 'Project Management', 'Digital Marketing', 'Public Speaking',
  'Content Writing', 'Graphic Design', 'Financial Literacy', 'Critical Thinking',
  'Team Collaboration', 'Communication', 'Leadership', 'Problem Solving',
  'Time Management', 'Research & Analysis', 'Microsoft Excel',
  'Python Programming', 'JavaScript', 'SQL', 'UI/UX Design', 'Video Editing',
  'Negotiation', 'Customer Service', 'Event Planning', 'Fundraising',
];

export const CAREER_INTERESTS = [
  'Software Engineering', 'Investment Banking', 'Public Health',
  'Agribusiness Management', 'Corporate Law', 'Human Resource Management',
  'Data Science', 'Supply Chain Logistics', 'Renewable Energy Engineering',
  'Architecture & Urban Planning', 'Education & Training', 'Medical Research',
  'International Development', 'Environmental Engineering', 'Entrepreneurship',
  'Digital Marketing', 'Finance & Accounting', 'Journalism & Media',
  'Public Policy', 'Social Work',
];

export const INDUSTRIES = [
  'Technology', 'Education', 'Finance', 'Healthcare', 'Marketing',
  'Nonprofit/NGO', 'Government', 'Media', 'Agriculture', 'Other',
];

export const COMPANY_SIZES = [
  '1–10 employees', '11–50 employees', '51–200 employees',
  '201–500 employees', '500–1,000 employees', '1,000+ employees',
];

export const POSITION_ROLES = [
  'HR Manager', 'Recruiter', 'Talent Acquisition Specialist',
  'Hiring Manager', 'Program Coordinator', 'Founder/CEO',
  'Operations Manager', 'University Representative',
  'Internship Coordinator', 'Other',
];
