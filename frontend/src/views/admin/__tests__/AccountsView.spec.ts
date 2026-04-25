import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import AccountsView from '../AccountsView.vue'

const {
  listAccounts,
  getBatchTodayStats,
  getAllProxies,
  getAllGroups
} = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getBatchTodayStats: vi.fn(),
  getAllProxies: vi.fn(),
  getAllGroups: vi.fn()
}))

vi.mock('@/api/admin', () => ({
  adminAPI: {
    accounts: {
      list: listAccounts,
      listWithEtag: vi.fn(),
      getBatchTodayStats,
      delete: vi.fn(),
      batchClearError: vi.fn(),
      batchRefresh: vi.fn(),
      bulkUpdate: vi.fn(),
      exportData: vi.fn(),
      getAvailableModels: vi.fn(),
      refreshCredentials: vi.fn(),
      recoverState: vi.fn(),
      resetAccountQuota: vi.fn(),
      setPrivacy: vi.fn(),
      setSchedulable: vi.fn()
    },
    proxies: {
      getAll: getAllProxies
    },
    groups: {
      getAll: getAllGroups
    }
  }
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn()
  })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isSimpleMode: false
  })
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key
    })
  }
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const createAccount = (id: number, name: string) => ({
  id,
  name,
  platform: 'openai',
  type: 'shared',
  status: 'active',
  schedulable: true,
  priority: 0,
  rate_multiplier: 1,
  last_used_at: null,
  expires_at: null,
  auto_pause_on_expired: false,
  created_at: '2026-04-17T00:00:00Z',
  updated_at: '2026-04-17T00:00:00Z',
  groups: [],
  group_ids: [],
  credentials: {},
  extra: {}
})

const createListResponse = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
  pages: 1
})

const DataTableStub = {
  props: ['columns', 'data', 'loading'],
  emits: ['sort'],
  template: `
    <div>
      <div data-test="table-loading">{{ String(loading) }}</div>
      <button data-test="sort-last-used" @click="$emit('sort', 'last_used_at', 'desc')">sort</button>
      <div data-test="rows">{{ data.map(row => row.name).join(',') }}</div>
    </div>
  `
}

const mountAccountsView = () => mount(AccountsView, {
  global: {
    stubs: {
      AppLayout: { template: '<div><slot /></div>' },
      TablePageLayout: {
        template: '<div><slot name="filters" /><slot name="table" /><slot name="pagination" /></div>'
      },
      DataTable: DataTableStub,
      Pagination: true,
      ConfirmDialog: true,
      CreateAccountModal: true,
      EditAccountModal: true,
      ReAuthAccountModal: true,
      AccountTestModal: true,
      AccountStatsModal: true,
      ScheduledTestsPanel: true,
      AccountActionMenu: true,
      SyncFromCrsModal: true,
      ImportDataModal: true,
      BulkEditAccountModal: true,
      TempUnschedStatusModal: true,
      ErrorPassthroughRulesModal: true,
      TLSFingerprintProfilesModal: true,
      AccountTableFilters: true,
      AccountTableActions: { template: '<div><slot name="beforeCreate" /><slot name="after" /></div>' },
      AccountBulkActionsBar: true,
      AccountStatusIndicator: true,
      AccountUsageCell: true,
      AccountTodayStatsCell: true,
      AccountGroupsCell: true,
      AccountCapacityCell: true,
      PlatformTypeBadge: true,
      Icon: true,
      Teleport: true
    }
  }
})

describe('admin AccountsView', () => {
  beforeEach(() => {
    localStorage.clear()

    listAccounts.mockReset()
    getBatchTodayStats.mockReset()
    getAllProxies.mockReset()
    getAllGroups.mockReset()

    getBatchTodayStats.mockResolvedValue({ stats: {} })
    getAllProxies.mockResolvedValue([])
    getAllGroups.mockResolvedValue([])
  })

  it('keeps the initial table skeleton while the first account load is pending', async () => {
    const firstLoad = createDeferred<ReturnType<typeof createListResponse>>()
    listAccounts.mockReturnValueOnce(firstLoad.promise)

    const wrapper = mountAccountsView()
    await flushPromises()

    expect(wrapper.get('[data-test="table-loading"]').text()).toBe('true')

    firstLoad.resolve(createListResponse([createAccount(1, 'alpha')]))
    await flushPromises()

    expect(wrapper.get('[data-test="table-loading"]').text()).toBe('false')
  })

  it('keeps existing rows visible while server-side sorting is pending', async () => {
    const sortedLoad = createDeferred<ReturnType<typeof createListResponse>>()
    listAccounts
      .mockResolvedValueOnce(createListResponse([createAccount(1, 'alpha')]))
      .mockReturnValueOnce(sortedLoad.promise)

    const wrapper = mountAccountsView()
    await flushPromises()

    expect(wrapper.get('[data-test="rows"]').text()).toBe('alpha')

    await wrapper.get('[data-test="sort-last-used"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="table-loading"]').text()).toBe('false')
    expect(wrapper.get('[data-test="rows"]').text()).toBe('alpha')
    expect(listAccounts).toHaveBeenLastCalledWith(
      1,
      20,
      expect.objectContaining({
        sort_by: 'last_used_at',
        sort_order: 'desc'
      }),
      expect.any(Object)
    )

    sortedLoad.resolve(createListResponse([createAccount(2, 'bravo')]))
    await flushPromises()

    expect(wrapper.get('[data-test="rows"]').text()).toBe('bravo')
  })
})
