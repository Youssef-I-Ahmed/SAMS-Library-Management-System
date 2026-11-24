import { apiRequest } from '../../lib/api';

export const getUnreadCount = (token, signal) => apiRequest('/notifications/unread-count', { token, signal });
export const listNotifications = (token, { page = 1, pageSize = 15 } = {}, signal) =>
  apiRequest(`/notifications?page=${page}&pageSize=${pageSize}`, { token, signal });
export const markNotificationsRead = (token, body) => apiRequest('/notifications/read', { method: 'POST', token, body });
export const sendAnnouncement = (token, body) => apiRequest('/notifications/announcements', { method: 'POST', token, body });
