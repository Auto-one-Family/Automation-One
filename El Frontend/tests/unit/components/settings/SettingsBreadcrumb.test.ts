/**
 * SettingsBreadcrumb Component Tests
 *
 * Covers: segment visibility, separator logic, click events.
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsBreadcrumb from '@/components/settings/SettingsBreadcrumb.vue'

describe('SettingsBreadcrumb', () => {
  describe('segment visibility', () => {
    it('renders all segments when all props are provided', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', subzone: 'Links', espId: 'ESP_AABB', gpio: 33 },
      })
      expect(wrapper.text()).toContain('Zelt')
      expect(wrapper.text()).toContain('Links')
      expect(wrapper.text()).toContain('ESP_AABB')
      expect(wrapper.text()).toContain('GPIO 33')
      wrapper.unmount()
    })

    it('hides zone segment when zone is null', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: null, subzone: 'Links', espId: 'ESP_AABB', gpio: 4 },
      })
      const segments = wrapper.findAll('.settings-breadcrumb__segment')
      const texts = segments.map(s => s.text())
      expect(texts.some(t => t === 'Zelt')).toBe(false)
      expect(texts).toContain('Links')
      wrapper.unmount()
    })

    it('hides subzone segment when subzone is null', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', subzone: null, espId: 'ESP_AABB', gpio: 4 },
      })
      const texts = wrapper.findAll('.settings-breadcrumb__segment').map(s => s.text())
      expect(texts.some(t => t.toLowerCase().includes('subzone'))).toBe(false)
      expect(texts).toContain('Zelt')
      wrapper.unmount()
    })

    it('hides espId and GPIO when not provided', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', subzone: 'Links' },
      })
      const text = wrapper.text()
      expect(text).not.toContain('ESP_')
      expect(text).not.toContain('GPIO')
      wrapper.unmount()
    })

    it('hides GPIO when gpio is null', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', espId: 'ESP_AABB', gpio: null },
      })
      expect(wrapper.text()).not.toContain('GPIO')
      wrapper.unmount()
    })

    it('renders gpio 0 (falsy number) as GPIO 0', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { espId: 'ESP_AABB', gpio: 0 },
      })
      expect(wrapper.text()).toContain('GPIO 0')
      wrapper.unmount()
    })

    it('renders nothing when all props are null', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: null, subzone: null, espId: null, gpio: null },
      })
      expect(wrapper.findAll('.settings-breadcrumb__segment').length).toBe(0)
      wrapper.unmount()
    })
  })

  describe('separator logic', () => {
    it('shows separator between zone and subzone only when both are present', () => {
      const withBoth = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', subzone: 'Links' },
      })
      expect(withBoth.findAll('.settings-breadcrumb__sep').length).toBe(1)
      withBoth.unmount()

      const zoneOnly = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt' },
      })
      expect(zoneOnly.findAll('.settings-breadcrumb__sep').length).toBe(0)
      zoneOnly.unmount()
    })

    it('shows separator between espId and GPIO when both are present', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { espId: 'ESP_AABB', gpio: 4 },
      })
      const seps = wrapper.findAll('.settings-breadcrumb__sep')
      expect(seps.length).toBe(1)
      wrapper.unmount()
    })

    it('shows two separators when zone + espId + gpio are provided (no subzone)', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', subzone: null, espId: 'ESP_AABB', gpio: 4 },
      })
      // zone › espId › GPIO 4
      expect(wrapper.findAll('.settings-breadcrumb__sep').length).toBe(2)
      wrapper.unmount()
    })
  })

  describe('click events', () => {
    it('emits zone-click when zone segment is clicked', async () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', subzone: 'Links' },
      })
      const segments = wrapper.findAll('.settings-breadcrumb__segment--clickable')
      await segments[0].trigger('click')
      expect(wrapper.emitted('zone-click')).toBeTruthy()
      expect(wrapper.emitted('zone-click')!.length).toBe(1)
      wrapper.unmount()
    })

    it('emits subzone-click when subzone segment is clicked', async () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt', subzone: 'Links' },
      })
      const clickable = wrapper.findAll('.settings-breadcrumb__segment--clickable')
      await clickable[1].trigger('click')
      expect(wrapper.emitted('subzone-click')).toBeTruthy()
      expect(wrapper.emitted('subzone-click')!.length).toBe(1)
      wrapper.unmount()
    })

    it('zone segment has clickable class', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { zone: 'Zelt' },
      })
      const zoneEl = wrapper.find('.settings-breadcrumb__segment--clickable')
      expect(zoneEl.exists()).toBe(true)
      expect(zoneEl.text()).toBe('Zelt')
      wrapper.unmount()
    })

    it('ESP segment does not have clickable class', () => {
      const wrapper = mount(SettingsBreadcrumb, {
        props: { espId: 'ESP_AABB', gpio: 4 },
      })
      const allSegments = wrapper.findAll('.settings-breadcrumb__segment')
      const espSegment = allSegments.find(s => s.text() === 'ESP_AABB')
      expect(espSegment?.classes()).not.toContain('settings-breadcrumb__segment--clickable')
      wrapper.unmount()
    })
  })
})
