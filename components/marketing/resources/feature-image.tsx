import Image from "next/image"

export function ResourceFeatureImage({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="mx-auto mt-10 max-w-3xl">
      <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3 shadow-[0_12px_34px_rgba(15,23,42,.08)] sm:p-5">
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={700}
          className="h-auto w-full rounded-lg"
          sizes="(max-width: 768px) 100vw, 768px"
        />
      </div>
      <figcaption className="mt-3 text-center text-sm text-slate-500">A closer look at the control behind the workflow.</figcaption>
    </figure>
  )
}
