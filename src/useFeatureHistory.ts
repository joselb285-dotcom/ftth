import { useCallback, useRef, useState } from 'react'
import type { AppFeature } from './types'
import { HISTORY_LIMIT } from './editorConstants'

export function useFeatureHistory(
  featuresRef: React.RefObject<AppFeature[]>,
  setFeatures: React.Dispatch<React.SetStateAction<AppFeature[]>>,
  setMessage: (msg: string) => void,
) {
  const historyRef = useRef<AppFeature[][]>([])
  const futureRef  = useRef<AppFeature[][]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  function resetHistory() {
    historyRef.current = []
    futureRef.current  = []
    setCanUndo(false)
    setCanRedo(false)
  }

  const commitFeatures = useCallback(
    (updater: AppFeature[] | ((prev: AppFeature[]) => AppFeature[])) => {
      historyRef.current = [...historyRef.current, featuresRef.current].slice(-HISTORY_LIMIT)
      futureRef.current  = []
      setCanUndo(true)
      setCanRedo(false)
      setFeatures(updater)
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const undo = useCallback(() => {
    const past = historyRef.current
    if (past.length === 0) { setMessage('Nada que deshacer.'); return }
    futureRef.current  = [featuresRef.current, ...futureRef.current].slice(0, HISTORY_LIMIT)
    historyRef.current = past.slice(0, -1)
    setCanUndo(past.length - 1 > 0)
    setCanRedo(true)
    setFeatures(past[past.length - 1])
    setMessage('Deshacer.')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const redo = useCallback(() => {
    const future = futureRef.current
    if (future.length === 0) { setMessage('Nada que rehacer.'); return }
    historyRef.current = [...historyRef.current, featuresRef.current].slice(-HISTORY_LIMIT)
    futureRef.current  = future.slice(1)
    setCanUndo(true)
    setCanRedo(future.length - 1 > 0)
    setFeatures(future[0])
    setMessage('Rehacer.')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { canUndo, canRedo, commitFeatures, undo, redo, resetHistory }
}
