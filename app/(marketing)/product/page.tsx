import { ProductOverview } from "@/components/marketing/product-page"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "Product — DocuBite" },
  description: "See how DocuBite turns supported documents into reviewable rows, explainable controls, close work and connected accounting outcomes.",
}

export default function ProductPage() {
  return <ProductOverview />
}
