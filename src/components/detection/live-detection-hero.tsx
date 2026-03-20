"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Camera, Pause, Play, AlertCircle } from "lucide-react"
import { InferenceEngine, CVImage } from "inferencejs"


export default function LiveDetectionHero() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelWorkerId, setModelWorkerId] = useState<string | null>(null)
  const [detectedObjects, setDetectedObjects] = useState<string[]>([])
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const inferEngine = useMemo(() => {
    return new InferenceEngine()
  }, [])

  useEffect(() => {
    if (!isModelLoading && !modelLoaded) {
      setIsModelLoading(true)
      setError(null)
      
      // Configuration for your labubu model
      const PUBLISHABLE_KEY = "rf_1p1rNn841ZQeKvx0lzLX5NWNeQp2"
      
      // Try different model ID formats
      const modelConfigs = [
        { id: "labubu", version: 1, description: "Model name only" },
        { id: "labubu-7hw2k", version: 1, description: "Model with workspace suffix" },
        { id: "labubu-7hw2k/1", version: null, description: "Model with version in ID" },
      ]
      
      let attemptIndex = 0
      
      const tryLoadModel = () => {
        if (attemptIndex >= modelConfigs.length) {
          console.error("All model configurations failed")
          setError("Failed to load model. Please ensure your model is deployed for web inference at https://app.roboflow.com")
          setIsModelLoading(false)
          return
        }
        
        const config = modelConfigs[attemptIndex]
        console.log(`Attempt ${attemptIndex + 1}: Trying ${config.description}`)
        console.log(`Model ID: "${config.id}", Version: ${config.version}`)
        
        const loadPromise = config.version !== null
          ? inferEngine.startWorker(config.id, config.version, PUBLISHABLE_KEY)
          : inferEngine.startWorker(config.id, PUBLISHABLE_KEY)
        
        loadPromise
          .then((id) => {
            console.log(`✅ Success! Model loaded with configuration:`, config)
            console.log(`Worker ID: ${id}`)
            setModelWorkerId(id)
            setModelLoaded(true)
            setIsModelLoading(false)
          })
          .catch((err) => {
            console.warn(`❌ Failed with ${config.description}:`, err.message || err)
            attemptIndex++
            tryLoadModel()
          })
      }
      
      tryLoadModel()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [inferEngine, isModelLoading, modelLoaded])

  const startWebcam = useCallback(async () => {
    try {
      setError(null)
      const constraints = {
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "environment"
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setIsStreaming(true)
        }
      }
    } catch (err) {
      console.error("Failed to access camera:", err)
      setError("Failed to access camera. Please ensure camera permissions are granted.")
    }
  }, [])

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setIsStreaming(false)
    setDetectedObjects([])
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d")
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
    }
  }, [])

  const detectFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !modelWorkerId || !isStreaming) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const img = new CVImage(video)
      
      inferEngine.infer(modelWorkerId, img).then((predictions) => {
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        const detectedClasses = new Set<string>()

        for (let i = 0; i < predictions.length; i++) {
          const prediction = predictions[i]
          detectedClasses.add(prediction.class)
          
          ctx.strokeStyle = prediction.color || "#00FF00"
          ctx.lineWidth = 3
          ctx.font = "16px sans-serif"
          
          const x = prediction.bbox.x - prediction.bbox.width / 2
          const y = prediction.bbox.y - prediction.bbox.height / 2
          
          ctx.strokeRect(x, y, prediction.bbox.width, prediction.bbox.height)
          
          const label = `${prediction.class} ${Math.round(prediction.confidence * 100)}%`
          const textWidth = ctx.measureText(label).width
          const textHeight = 20
          
          ctx.fillStyle = prediction.color || "#00FF00"
          ctx.fillRect(x, y - textHeight - 4, textWidth + 8, textHeight + 4)
          
          ctx.fillStyle = "#FFFFFF"
          ctx.fillText(label, x + 4, y - 6)
        }

        setDetectedObjects(Array.from(detectedClasses))
      }).catch((err) => {
        console.error("Detection error:", err)
      })
    }

    animationFrameRef.current = requestAnimationFrame(detectFrame)
  }, [inferEngine, modelWorkerId, isStreaming])

  useEffect(() => {
    if (isStreaming && modelWorkerId) {
      detectFrame()
    }
  }, [isStreaming, modelWorkerId, detectFrame])

  const toggleStream = useCallback(() => {
    if (isStreaming) {
      stopWebcam()
    } else {
      startWebcam()
    }
  }, [isStreaming, startWebcam, stopWebcam])

  return (
    <div className="w-full">
      <div className="mx-auto text-center">

        <div className="relative w-full mb-8">
          <div className="bg-gray-50 rounded-2xl overflow-hidden">
            <div className="relative aspect-video bg-gray-100 rounded-2xl overflow-hidden">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
              />

              {!isStreaming && !error && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <Camera className="w-8 h-8 text-green-600" />
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-50">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  </div>
                </div>
              )}
            </div>

            {detectedObjects.length > 0 && (
              <div className="mt-4 p-4 bg-green-50 rounded-xl">
                <p className="text-sm font-medium text-gray-800 mb-2">Detected Objects:</p>
                <div className="flex flex-wrap gap-2">
                  {detectedObjects.map((obj, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-green-200 text-green-800 rounded-full text-sm font-medium"
                    >
                      {obj}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        <div>
          <Button
            size="lg"
            onClick={toggleStream}
            disabled={isModelLoading || (!modelLoaded && !isStreaming)}
            className="bg-black text-white px-6 py-3 rounded-full hover:bg-gray-800"
          >
{isStreaming ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                STOP
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                START
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}