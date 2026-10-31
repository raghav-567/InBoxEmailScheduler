import axios from 'axios';
import type {
  User,
  EmailJob,
  EmailStats,
  PaginatedResponse,
  ScheduleEmailPayload,
  Sender,
} from '../types';

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const getMe = async (): Promise<User> => {
  const { data } = await api.get('/api/auth/me');
  return data.user ?? data;
};

export const logout = async (): Promise<void> => {
  await api.post('/api/auth/logout');
  localStorage.removeItem('token');
};

export const getScheduledEmails = async (
  page = 1,
  limit = 20
): Promise<PaginatedResponse<EmailJob>> => {
  const { data } = await api.get('/api/emails/scheduled', {
    params: { page, limit },
  });
  return data;
};

export const getSentEmails = async (
  page = 1,
  limit = 20
): Promise<PaginatedResponse<EmailJob>> => {
  const { data } = await api.get('/api/emails/sent', {
    params: { page, limit },
  });
  return data;
};

export const scheduleEmails = async (
  payload: ScheduleEmailPayload
): Promise<void> => {
  await api.post('/api/emails/schedule', payload);
};

export const searchEmails = async (query: string): Promise<EmailJob[]> => {
  const { data } = await api.get('/api/emails/search', {
    params: { q: query },
  });
  return data.data ?? data;
};

export const getEmailStats = async (): Promise<EmailStats> => {
  const { data } = await api.get('/api/emails/stats');
  return data;
};

export const uploadCsv = async (file: File): Promise<string[]> => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/api/emails/upload-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.emails ?? data;
};

export const getSenders = async (): Promise<Sender[]> => {
  const { data } = await api.get('/api/senders');
  return data.senders ?? data.data ?? data;
};

export const createSender = async (): Promise<Sender> => {
  const { data } = await api.post('/api/senders');
  return data.sender ?? data;
};

export const getSlackAuthUrl = async (): Promise<string> => {
  const { data } = await api.get('/api/slack/connect');
  return data.authUrl;
};

export const getSlackStatus = async (): Promise<{ connected: boolean }> => {
  const { data } = await api.get('/api/slack/status');
  return data;
};

export const disconnectSlack = async (): Promise<void> => {
  await api.post('/api/slack/disconnect');
};

export default api;
