import { useContext } from 'react'
import { CartContext } from '../context/cartContext'

export function useCart() {
  return useContext(CartContext)
}
