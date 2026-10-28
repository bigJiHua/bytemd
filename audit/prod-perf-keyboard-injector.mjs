export class KeyboardInjector {
  async typeText(session, text) {
    for (const char of text) {
      await this.pressKey(session, char)
    }
  }

  async pressKey(session, key) {
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: key.length === 1 ? key : undefined,
      key,
      code: this._keyCode(key),
      windowsVirtualKeyCode: this._winKeyCode(key),
    })
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: this._keyCode(key),
      windowsVirtualKeyCode: this._winKeyCode(key),
    })
  }

  _keyCode(key) {
    const map = { Enter: 'Enter', Backspace: 'Backspace', ' ': 'Space' }
    return map[key] || 'Key' + key.toUpperCase()
  }

  _winKeyCode(key) {
    if (key === 'Enter') return 13
    if (key === 'Backspace') return 8
    if (key === ' ') return 32
    return key.charCodeAt(0)
  }
}
