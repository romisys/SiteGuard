import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useFrameCaptures } from './useFrameCaptures'

function fakeVideo() {
  const listeners: Record<string, Array<() => void>> = {}
  const el = {
    videoWidth: 1600,
    videoHeight: 900,
    preload: '',
    muted: false,
    crossOrigin: '',
    src: '',
    currentTime: 0,
    requestVideoFrameCallback: undefined as ((cb: () => void) => number) | undefined,
    cancelVideoFrameCallback: vi.fn(),
    addEventListener: (name: string, fn: () => void) => {
      ;(listeners[name] ??= []).push(fn)
    },
    removeEventListener: (name: string, fn: () => void) => {
      listeners[name] = (listeners[name] ?? []).filter((l) => l !== fn)
    },
    load: vi.fn(),
    remove: vi.fn(),
  }
  return {
    el,
    asVideo: () => el as unknown as HTMLVideoElement,
    fire: (name: string) => (listeners[name] ?? []).forEach((fn) => fn()),
    /** Seeking is asynchronous: answer each seek on the next microtask. */
    answerSeeks: (seeks: number[]) =>
      Object.defineProperty(el, 'currentTime', {
        get: () => 0,
        set: (t: number) => {
          seeks.push(t)
          queueMicrotask(() => (listeners.seeked ?? []).forEach((fn) => fn()))
        },
      }),
  }
}

describe('useFrameCaptures', () => {
  it('seeks to each timestamp in order and returns one image per capture', async () => {
    const video = fakeVideo()
    const seeks: number[] = []
    video.answerSeeks(seeks)

    const { result } = renderHook(() =>
      useFrameCaptures({
        src: '/api/analyses/a1/media',
        timestamps: [4, 7],
        enabled: true,
        createVideo: video.asVideo,
        capture: () => 'blob:frame',
      }),
    )

    video.fire('loadedmetadata')
    await waitFor(() => expect(Object.keys(result.current.frames)).toHaveLength(2))
    expect(seeks).toEqual([4, 7])
    expect(result.current.frames[0]).toBe('blob:frame')
    expect(result.current.frames[1]).toBe('blob:frame')
    expect(video.el.load).toHaveBeenCalledTimes(1) // one element, one download
  })

  it('waits for the painted frame when requestVideoFrameCallback exists', async () => {
    const video = fakeVideo()
    const painted: Array<() => void> = []
    video.el.requestVideoFrameCallback = (cb) => painted.push(cb)
    video.answerSeeks([])

    const { result } = renderHook(() =>
      useFrameCaptures({
        src: '/m',
        timestamps: [4],
        enabled: true,
        createVideo: video.asVideo,
        capture: () => 'blob:frame',
      }),
    )

    video.fire('loadedmetadata')
    await waitFor(() => expect(painted).toHaveLength(1))
    expect(result.current.frames).toEqual({}) // `seeked` alone is not a painted frame
    act(() => painted[0]())
    await waitFor(() => expect(result.current.frames[0]).toBe('blob:frame'))
  })

  it('reports failure without throwing when the media cannot load', async () => {
    const video = fakeVideo()
    const { result } = renderHook(() =>
      useFrameCaptures({
        src: '/bad',
        timestamps: [1],
        enabled: true,
        createVideo: video.asVideo,
        capture: () => 'blob:frame',
      }),
    )

    video.fire('error')
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.frames).toEqual({})
  })

  it('stops capturing once unmounted', () => {
    const video = fakeVideo()
    const seeks: number[] = []
    // Answer each seek by hand so the run can be interrupted mid-queue.
    Object.defineProperty(video.el, 'currentTime', { get: () => 0, set: (t: number) => seeks.push(t) })

    const { result, unmount } = renderHook(() =>
      useFrameCaptures({
        src: '/m',
        timestamps: [4, 7, 9],
        enabled: true,
        createVideo: video.asVideo,
        capture: () => 'blob:frame',
      }),
    )

    act(() => video.fire('loadedmetadata'))
    expect(seeks).toEqual([4])
    act(() => video.fire('seeked'))
    expect(seeks).toEqual([4, 7])
    expect(result.current.frames[0]).toBe('blob:frame')

    unmount()
    video.fire('seeked') // the seek that was in flight lands after teardown
    expect(seeks).toEqual([4, 7]) // no further seek queued
    expect(video.el.remove).toHaveBeenCalledTimes(1)
  })

  it('does not restart when the caller passes fresh callbacks on every render', async () => {
    const video = fakeVideo()
    const seeks: number[] = []
    video.answerSeeks(seeks)

    const { result, rerender } = renderHook(() =>
      useFrameCaptures({
        src: '/m',
        timestamps: [4],
        enabled: true,
        // New identities every render, as an inline arrow function would be.
        createVideo: () => video.asVideo(),
        capture: () => 'blob:frame',
      }),
    )

    video.fire('loadedmetadata')
    await waitFor(() => expect(result.current.frames[0]).toBe('blob:frame'))
    rerender()
    rerender()
    await new Promise((r) => setTimeout(r, 10))
    expect(video.el.load).toHaveBeenCalledTimes(1)
    expect(seeks).toEqual([4])
  })

  it('does nothing when disabled', () => {
    const createVideo = vi.fn(() => fakeVideo().asVideo())
    renderHook(() =>
      useFrameCaptures({ src: '/x', timestamps: [1], enabled: false, createVideo, capture: () => '' }),
    )
    expect(createVideo).not.toHaveBeenCalled()
  })
})
