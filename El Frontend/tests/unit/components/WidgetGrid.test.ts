/**
 * Tests for WidgetGrid component.
 * Verifies grid rendering and collapse behavior.
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WidgetGrid from '@/components/widgets/WidgetGrid.vue'

function mountGrid(collapsed = false, slotContent = '<div class="child">Widget</div>') {
  return mount(WidgetGrid, {
    props: { collapsed },
    slots: { default: slotContent },
  })
}

describe('WidgetGrid', () => {
  it('renders slot content', () => {
    const wrapper = mountGrid()
    expect(wrapper.find('.child').exists()).toBe(true)
  })

  it('applies collapsed class when collapsed prop is true', () => {
    const wrapper = mountGrid(true)
    expect(wrapper.find('.widget-grid-wrapper--collapsed').exists()).toBe(true)
  })

  it('does not apply collapsed class when expanded', () => {
    const wrapper = mountGrid(false)
    expect(wrapper.find('.widget-grid-wrapper--collapsed').exists()).toBe(false)
  })

  it('has role="region" for accessibility', () => {
    const wrapper = mountGrid()
    expect(wrapper.find('[role="region"]').exists()).toBe(true)
  })

  it('has aria-label', () => {
    const wrapper = mountGrid()
    const region = wrapper.find('[role="region"]')
    expect(region.attributes('aria-label')).toBeTruthy()
  })
})
