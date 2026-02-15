/**
 * LevelNavigation Component Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LevelNavigation from '@/components/dashboard/LevelNavigation.vue'

// lucide-vue-next is mocked globally in tests/setup.ts

describe('LevelNavigation', () => {
  it('renders 3 tab buttons', () => {
    const wrapper = mount(LevelNavigation, {
      props: { currentLevel: 1 },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(3)
  })

  it('shows correct labels', () => {
    const wrapper = mount(LevelNavigation, {
      props: { currentLevel: 1 },
    })
    const text = wrapper.text()
    expect(text).toContain('ESPs')
    expect(text).toContain('Komponenten')
    expect(text).toContain('Zonen')
  })

  it('marks current level as active', () => {
    const wrapper = mount(LevelNavigation, {
      props: { currentLevel: 2 },
    })
    const buttons = wrapper.findAll('button')
    // Level 2 (index 1) should have --active class
    expect(buttons[1].classes()).toContain('level-nav__tab--active')
    expect(buttons[0].classes()).not.toContain('level-nav__tab--active')
    expect(buttons[2].classes()).not.toContain('level-nav__tab--active')
  })

  it('emits update:currentLevel on click', async () => {
    const wrapper = mount(LevelNavigation, {
      props: { currentLevel: 1 },
    })
    const buttons = wrapper.findAll('button')
    await buttons[2].trigger('click') // Click "Zonen" (level 3)
    expect(wrapper.emitted('update:currentLevel')).toBeTruthy()
    expect(wrapper.emitted('update:currentLevel')![0]).toEqual([3])
  })

  it('disables buttons when transitioning', () => {
    const wrapper = mount(LevelNavigation, {
      props: { currentLevel: 1, isTransitioning: true },
    })
    const buttons = wrapper.findAll('button')
    buttons.forEach(btn => {
      expect(btn.attributes('disabled')).toBeDefined()
    })
  })

  it('has correct aria attributes', () => {
    const wrapper = mount(LevelNavigation, {
      props: { currentLevel: 2 },
    })
    const nav = wrapper.find('nav')
    expect(nav.attributes('role')).toBe('tablist')

    const buttons = wrapper.findAll('button')
    buttons.forEach(btn => {
      expect(btn.attributes('role')).toBe('tab')
    })
    // Level 2 should be aria-selected=true
    expect(buttons[1].attributes('aria-selected')).toBe('true')
    expect(buttons[0].attributes('aria-selected')).toBe('false')
  })
})
