const now = new Date();
const nextWeekday = new Date(now);
nextWeekday.setDate(nextWeekday.getDate() + ((8 - nextWeekday.getDay()) % 7 || 1));
nextWeekday.setHours(0, 0, 0, 0);
const dateAt = (hour) => new Date(Date.UTC(nextWeekday.getFullYear(), nextWeekday.getMonth(), nextWeekday.getDate(), hour - 6, 30)).toISOString();

export const demoRooms = [
  { id: 'demo-507', code: '507', name: 'Orchard Lecture Hall', building: 'North Campus', floor: 5, capacity: 66, equipment: ['Projector', 'Flexible seating'], is_active: true, operational_status: 'operational' },
  { id: 'demo-a101', code: 'A-101', name: 'Maple Seminar Room', building: 'VKC Block', floor: 1, capacity: 42, equipment: ['Projector', 'Whiteboard'], is_active: true, operational_status: 'operational' },
  { id: 'demo-b204', code: 'B-204', name: 'Science Computer Lab', building: 'Science Block', floor: 2, capacity: 28, equipment: ['Computers', 'Projector'], is_active: true, operational_status: 'operational' },
  { id: 'demo-c312', code: 'C-312', name: 'Cedar Collaboration Room', building: 'VKC Block', floor: 3, capacity: 24, equipment: ['Whiteboard', 'Video conferencing'], is_active: true, operational_status: 'operational' },
  { id: 'demo-l07', code: 'L-07', name: 'Innovation Lab', building: 'Science Block', floor: 1, capacity: 36, equipment: ['Computers', 'Flexible seating'], is_active: true, operational_status: 'operational' },
];

export const demoBookings = [
  { id: 'demo-booking-own', room_id: 'demo-507', user_id: 'demo-user', title: 'Project review', purpose: 'Capstone team review', starts_at: dateAt(9), ends_at: dateAt(10), status: 'confirmed', booking_type: 'normal', confirmation_code: 'DEMO507' },
];

export const demoTimetable = [
  { id: 'demo-entry-1', room_id: 'demo-a101', subject: 'Data Structures', section: 'CSE A', faculty: 'Prof. Jim Carter', starts_at: dateAt(10), ends_at: dateAt(11), status: 'scheduled' },
  { id: 'demo-entry-2', room_id: 'demo-b204', subject: 'Programming Lab', section: 'IT B', faculty: 'Dr. Meera Shah', starts_at: dateAt(13), ends_at: dateAt(15), status: 'scheduled' },
];
