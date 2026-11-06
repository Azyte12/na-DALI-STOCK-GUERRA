/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */

import { User } from '../models/userModel.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { csrfToken } from '../middleware/workspaceAuth.js';
const renderAuth = (req, res, register = false, error = null, status = 200) =>
  res.status(status).render('auth', {
    title: register ? 'Create account | DALIStock' : 'Sign in | DALIStock',
    register,
    error,
    csrfToken: csrfToken(req),
  });
export const loginPage = (req, res) => renderAuth(req, res);
export const registerPage = (req, res) => renderAuth(req, res, true);
export const forgotPasswordPage = (req, res) =>
  res.render('error', {
    title: 'Account help | DALIStock',
    message: 'Contact your system administrator to reset your password.',
  });
export const dashboardPage = (req, res) => res.redirect('/');
const regenerate = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
const saveSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
export async function loginUser(req, res) {
  const { email, password } = req.body;
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.length > 254 ||
    password.length > 128
  )
    return renderAuth(req, res, false, 'Enter a valid email and password.', 422);
  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.password)))
    return renderAuth(req, res, false, 'Email or password is incorrect.', 401);
  await regenerate(req);
  req.session.userId = user.id;
  csrfToken(req);
  await saveSession(req);
  res.redirect('/');
}
export async function registerUser(req, res) {
  const { name, email, password } = req.body;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 80 ||
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  )
    return renderAuth(
      req,
      res,
      true,
      'Enter your name, a valid email, and a password of 12�128 characters.',
      422,
    );
  const normalized = email.trim().toLowerCase();
  if (await User.findOne({ where: { email: normalized } }))
    return renderAuth(req, res, true, 'This email is already registered.', 409);
  const user = await User.create({
    name: name.trim(),
    email: normalized,
    password: await hashPassword(password),
    role: 'visitors',
  });
  await regenerate(req);
  req.session.userId = user.id;
  csrfToken(req);
  await saveSession(req);
  res.redirect('/');
}
export async function logoutUser(req, res) {
  await new Promise((resolve, reject) =>
    req.session.destroy((error) => (error ? reject(error) : resolve())),
  );
  res.clearCookie('dalistock.sid');
  res.redirect('/login');
}
