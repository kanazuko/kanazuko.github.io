import { useCallback } from 'react'
import {
  getCategories,
  getProductBySlug,
  getProducts,
  getProductsByCategory,
  getRelatedProducts,
} from '../services/catalogService'
import { useAsyncData } from './useAsyncData'

export function useCategories() {
  const loader = useCallback(() => getCategories(), [])
  return useAsyncData(loader)
}

export function useProducts(options = {}) {
  const { featured = false } = options
  const loader = useCallback(() => getProducts({ featured }), [featured])
  return useAsyncData(loader)
}

export function useCategoryProducts(slug) {
  const loader = useCallback(() => getProductsByCategory(slug), [slug])
  return useAsyncData(loader)
}

export function useProduct(slug) {
  const loader = useCallback(() => getProductBySlug(slug), [slug])
  return useAsyncData(loader)
}

export function useRelatedProducts(categoryId, productId) {
  const loader = useCallback(
    () => getRelatedProducts(categoryId, productId),
    [categoryId, productId],
  )
  return useAsyncData(loader)
}
