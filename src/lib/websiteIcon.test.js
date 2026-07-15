import assert from 'node:assert/strict'
import { deriveWebsiteName, normalizeWebsiteUrl } from './websiteIcon.ts'

assert.equal(normalizeWebsiteUrl('example.com'), 'https://example.com/')
assert.equal(
  normalizeWebsiteUrl(' http://example.com/docs?q=desktop '),
  'http://example.com/docs?q=desktop'
)
assert.equal(normalizeWebsiteUrl('ftp://example.com'), '')
assert.equal(normalizeWebsiteUrl('not a website'), '')
assert.equal(normalizeWebsiteUrl(''), '')

assert.equal(deriveWebsiteName('https://www.example.com/path'), 'example.com')
assert.equal(deriveWebsiteName('desktopgo.app'), 'desktopgo.app')
assert.equal(deriveWebsiteName('not a website'), '')

console.log('websiteIcon tests passed')
