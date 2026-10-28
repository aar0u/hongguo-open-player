const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

test('desktop recreates windows with one server and registers show before loading', async () => {
  const app = new EventEmitter();
  Object.assign(app, { commandLine: { appendSwitch() {} }, requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(), getPath: () => '/tmp/player-user', quit() {} });
  const windows = [];
  class Window extends EventEmitter {
    static getAllWindows() { return windows.filter(w => !w.closed); }
    constructor() { super(); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = handler => { this.open = handler; }; windows.push(this); }
    async loadURL() { this.emit('ready-to-show'); }
    show() { this.shown = true; }
  }
  let starts = 0;
  const context = { console, process: { platform: 'darwin', env: {} }, __dirname: '/repo/src/electron',
    require(name) {
      if (name === 'electron') return { app, BrowserWindow: Window, Menu: { buildFromTemplate() {}, setApplicationMenu() {} }, shell: { openExternal: async () => {} } };
      if (name === '../server/index.js') return { startServer: async () => { starts++; return { server: { close() {} }, port: 8899 }; } };
      return require(name);
    } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/electron/main.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(windows[0].shown, true);
  windows[0].closed = true;
  windows[0].emit('closed');
  app.emit('activate');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(starts, 1);
  assert.equal(windows[1].shown, true);
  assert.equal(windows[1].open({ url: 'file:///etc/passwd' }).action, 'deny');
});
