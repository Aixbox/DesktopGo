import { createContext, useContext } from 'react'

export const FocusedItemMenuContext = createContext({ focused: false, dismiss: () => {} })
export const useItemMenuFocused = () => useContext(FocusedItemMenuContext).focused
export const useDismissItemMenu = () => useContext(FocusedItemMenuContext).dismiss
