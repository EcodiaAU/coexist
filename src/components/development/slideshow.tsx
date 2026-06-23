import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SlideshowProps {
  images: string[]
  captions?: string[]
  className?: string
}

export function Slideshow({ images, captions = [], className }: SlideshowProps) {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(0)

  if (images.length === 0) {
    return (
      <div className={cn('rounded-sm bg-primary-100 p-8 text-center text-sm text-primary-500', className)}>
        No images in this slideshow
      </div>
    )
  }

  const go = (newIndex: number) => {
    setDirection(newIndex > current ? 1 : -1)
    setCurrent(newIndex)
  }

  const prev = () => go(current === 0 ? images.length - 1 : current - 1)
  const next = () => go(current === images.length - 1 ? 0 : current + 1)

  return (
    <div className={cn('rounded-sm overflow-hidden', className)}>
      {/* Image area */}
      <div className="relative aspect-[16/10] bg-primary-900 overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.img
            key={current}
            src={images[current]}
            alt={captions[current] || `Slide ${current + 1}`}
            custom={direction}
            initial={{ x: direction > 0 ? 200 : -200, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? -200 : 200, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </AnimatePresence>

        {/* Nav arrows */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-sm"
              aria-label="Previous slide"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-sm"
              aria-label="Next slide"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}

        {/* Slide counter */}
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-black/40 text-white text-xs font-medium backdrop-blur-sm">
          {current + 1} / {images.length}
        </div>
      </div>

      {/* Caption + dots */}
      <div className="bg-white px-4 py-3">
        {captions[current] && (
          <p className="text-sm text-primary-700 text-center mb-2">{captions[current]}</p>
        )}
        {images.length > 1 && (
          <div className="flex items-center justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                className={cn(
                  'w-2 h-2 rounded-full transition-[width,background-color]',
                  i === current
                    ? 'bg-primary-600 w-4'
                    : 'bg-primary-300 hover:bg-primary-400',
                )}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Slideshow
