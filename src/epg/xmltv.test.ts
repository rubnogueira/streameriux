import { describe, expect, it } from 'vitest'
import { parseXmltv, parseXmltvTime } from './xmltv'

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ONE.us">
    <display-name lang="en">One</display-name>
  </channel>
  <channel id="ACME.1.HD.us">
    <display-name lang="en">Acme 1 HD</display-name>
  </channel>
  <programme start="20260908010000 +0000" stop="20260908023000 +0000" channel="ONE.us">
    <title lang="en">Evening News</title>
    <desc lang="en">Nightly news bulletin</desc>
    <category lang="en">News</category>
  </programme>
  <programme start="20260908023000 +0000" stop="20260908040000 +0000" channel="ACME.1.HD.us">
    <title>Film &amp; Show</title>
  </programme>
</tv>`

describe('parseXmltvTime', () => {
  it('parses XMLTV datetime with UTC offset', () => {
    const ms = parseXmltvTime('20260908010000 +0000')
    expect(new Date(ms).toISOString()).toBe('2026-09-08T01:00:00.000Z')
  })
})

describe('parseXmltv', () => {
  it('extracts channels and programmes', () => {
    const parsed = parseXmltv(FIXTURE)
    expect(parsed.channels).toHaveLength(2)
    expect(parsed.channels[0]).toMatchObject({ id: 'ONE.us', displayNames: ['One'] })
    const one = parsed.programmes.get('ONE.us')
    expect(one).toHaveLength(1)
    expect(one![0]).toMatchObject({
      title: 'Evening News',
      desc: 'Nightly news bulletin',
      category: 'News',
    })
    expect(one![0]!.title).toBe('Evening News')
    const acme = parsed.programmes.get('ACME.1.HD.us')!
    expect(acme[0]!.title).toBe('Film & Show')
  })
})
