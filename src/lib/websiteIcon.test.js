import assert from 'node:assert/strict'
import { deriveWebsiteName, isWebsiteTarget, normalizeWebsiteUrl } from './websiteIcon.ts'

assert.equal(normalizeWebsiteUrl('example.com'), 'https://example.com/')
assert.equal(
  normalizeWebsiteUrl(' http://example.com/docs?q=desktop '),
  'http://example.com/docs?q=desktop'
)
assert.equal(normalizeWebsiteUrl('ftp://example.com'), '')
assert.equal(normalizeWebsiteUrl('not a website'), '')
assert.equal(normalizeWebsiteUrl(''), '')

assert.equal(isWebsiteTarget('example.com'), true)
assert.equal(isWebsiteTarget('https://example.com/path'), true)
assert.equal(isWebsiteTarget('C:\\Program Files\\DesktopGo\\DesktopGo.exe'), false)
assert.equal(isWebsiteTarget('D:/Apps/DesktopGo.exe'), false)
assert.equal(isWebsiteTarget('\\\\server\\share\\DesktopGo.exe'), false)
assert.equal(isWebsiteTarget('/usr/bin/desktopgo'), false)

assert.equal(deriveWebsiteName('https://www.example.com/path'), 'example.com')
assert.equal(deriveWebsiteName('desktopgo.app'), 'desktopgo.app')
assert.equal(deriveWebsiteName('not a website'), '')

console.log('websiteIcon tests passed')
