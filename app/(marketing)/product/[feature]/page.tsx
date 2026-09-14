import { getProductFeature, PRODUCT_FEATURES, ProductFeaturePage } from "@/components/marketing/product-page"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

export function generateStaticParams() {
  return PRODUCT_FEATURES.map((feature) => ({ feature: feature.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const feature = getProductFeature((await params).feature)
  if (!feature) return { title: "Product — DocuBite" }
  return {
    title: `${feature.title} — DocuBite`,
    description: feature.summary,
  }
}

export default async function ProductFeatureRoute({ params }: { params: Promise<{ feature: string }> }) {
  const feature = getProductFeature((await params).feature)
  if (!feature) notFound()
  return <ProductFeaturePage feature={feature} />
}
