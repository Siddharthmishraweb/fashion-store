import { get, patch, post } from './client.js'

export const authApi = {
  login: (payload) => post('/auth/login', payload),
  register: (payload) => post('/auth/register', payload),
  requestOtp: (payload) => post('/auth/otp/request', payload),
  verifyOtp: (payload) => post('/auth/otp/verify', payload),
  forgot: (payload) => post('/auth/forgot', payload),
  logout: () => post('/auth/logout'),
  me: () => get('/auth/me'),
  updateProfile: (payload) => patch('/auth/me', payload),
  changePassword: (payload) => post('/auth/password', payload),
}
