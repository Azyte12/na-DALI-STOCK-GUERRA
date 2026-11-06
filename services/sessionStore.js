import session from 'express-session';
import { Session } from '../models/inventoryModels.js';
export class DatabaseSessionStore extends session.Store {
  get(sid, callback) {
    Session.findByPk(sid).then(async row => {
      if (!row) return callback(null, null);
      if (row.expiresAt <= new Date()) { await row.destroy(); return callback(null, null); }
      callback(null, JSON.parse(row.data));
    }).catch(callback);
  }
  set(sid, data, callback = () => {}) {
    Session.upsert({ sid, data: JSON.stringify(data), expiresAt: data.cookie.expires || new Date(Date.now() + 8 * 60 * 60 * 1000) }).then(() => callback()).catch(callback);
  }
  destroy(sid, callback = () => {}) { Session.destroy({ where: { sid } }).then(() => callback()).catch(callback); }
  touch(sid, data, callback = () => {}) {
    Session.update({ expiresAt: data.cookie.expires || new Date(Date.now() + 8 * 60 * 60 * 1000) }, { where: { sid } }).then(() => callback()).catch(callback);
  }
}
