/**
 * Tests for WidgetCard component.
 * Verifies title, icon, collapsible behavior, loading/error states.
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WidgetCard from '@/components/widgets/WidgetCard.vue'

function mountWidget(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(WidgetCard, {
    props: {
      title: 'Test Widget',
      ...props,
    },
    slots: {
      default: '<div class="widget-content">Content</div>',
      ...slots,
    },
    global: {
      stubs: {
        BaseCard: {
          template: '<div class="base-card"><slot name="header" /><slot /><slot name="footer" /></div>',
        },
        BaseSkeleton: {
          template: '<div class="base-skeleton"></div>',
        },
        BaseBadge: {
          template: '<div class="base-badge"><slot /></div>',
          props: ['variant'],
        },
      },
    },
  })
}

describe('WidgetCard', () => {
  it('renders widget title', () => {
    const wrapper = mountWidget()
    expect(wrapper.text()).toContain('Test Widget')
  })

  it('renders default slot content', () => {
    const wrapper = mountWidget()
    expect(wrapper.find('.widget-content').exists()).toBe(true)
  })

  it('renders footer slot', () => {
    const wrapper = mountWidget({}, { footer: '<span class="footer-test">Footer</span>' })
    expect(wrapper.find('.footer-test').exists()).toBe(true)
  })

  it('shows error message when error prop is set', () => {
    const wrapper = mountWidget({ error: 'Connection failed' })
    expect(wrapper.text()).toContain('Connection failed')
  })

  it('applies span CSS class based on span prop', () => {
    const wrapper = mountWidget({ span: '2x1' })
    expect(wrapper.find('.widget-card--span-2x1').exists()).toBe(true)
  })

  it('collapse toggle works when collapsible', async () => {
    const wrapper = mountWidget({ collapsible: true })
    const toggleBtn = wrapper.find('.widget-card__collapse-btn')
    expect(toggleBtn.exists()).toBe(true)

    // Initially expanded
    expect(wrapper.find('.widget-card__body--collapsed').exists()).toBe(false)

    await toggleBtn.trigger('click')
    expect(wrapper.find('.widget-card__body--collapsed').exists()).toBe(true)
  })

  it('does not show collapse button when not collapsible', () => {
    const wrapper = mountWidget({ collapsible: false })
    expect(wrapper.find('.widget-card__collapse-btn').exists()).toBe(false)
  })
})
