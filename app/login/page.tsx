'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Mail, Lock, Eye, EyeOff, Phone, User, Home as HomeIcon,
  ShieldCheck, Lock as LockIcon, Headphones, Camera, FileText, Check, MessageCircle
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isSignup, setIsSignup] = useState(searchParams.get('mode') === 'signup')
  const [signupStep, setSignupStep] = useState(1) // 1: Account, 2: Role, 3: Verification

  // Account fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Role
  const [role, setRole] = useState('')

  // Verification (landlord only)
  const [ownershipDoc, setOwnershipDoc] = useState('')
  const [docUploading, setDocUploading] = useState(false)
  const [selfieUrl, setSelfieUrl] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Reacts every time the URL's ?mode= param changes, even without a full remount —
  // this is what makes clicking "Log in" / "Sign Up" work while already on /login.
  useEffect(() => {
    setIsSignup(searchParams.get('mode') === 'signup')
  }, [searchParams])

  useEffect(() => {
    if (showCamera && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    }
  }, [showCamera])

  // Password validation
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }
  const passwordValid = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch = password.length > 0 && password === confirmPassword

  const captureSelfie = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8))
    if (!blob) return
    const stream = video.srcObject as MediaStream
    stream?.getTracks().forEach((t) => t.stop())
    const data = new FormData()
    data.append('file', blob, 'selfie.jpg')
    data.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!)
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: data }
    )
    const json = await res.json()
    if (json.secure_url) setSelfieUrl(json.secure_url)
    setShowCamera(false)
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocUploading(true)
    const data = new FormData()
    data.append('file', file)
    data.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!)
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/auto/upload`,
      { method: 'POST', body: data }
    )
    const json = await res.json()
    if (json.secure_url) setOwnershipDoc(json.secure_url)
    setDocUploading(false)
  }

  // Step 1 -> Step 2
  const handleStep1Continue = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    if (!fullName || !phone || !email || !password || !confirmPassword) {
      setMessage('Please fill in all fields.')
      return
    }
    if (!passwordValid) {
      setMessage('Please meet all password requirements.')
      return
    }
    if (!passwordsMatch) {
      setMessage('Passwords do not match.')
      return
    }
    setSignupStep(2)
  }

  // Step 2 -> submit (tenant) or Step 3 (landlord)
  const handleStep2Continue = () => {
    if (!role) {
      setMessage('Please select a role.')
      return
    }
    setMessage('')
    if (role === 'tenant') {
      completeSignup()
    } else {
      setSignupStep(3)
    }
  }

  const completeSignup = async () => {
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    })
    if (error) {
      setMessage(error.message)
    } else if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        role,
        phone,
        verified: false,
        verification_status: role === 'landlord' ? 'pending' : 'approved',
        ownership_doc_url: ownershipDoc || null,
      })
      setMessage(
        role === 'tenant'
          ? 'Account created! You can now log in.'
          : 'Account created! Please log in to complete verification.'
      )
      setTimeout(() => {
        setIsSignup(false)
        setSignupStep(1)
      }, 1500)
    }
    setLoading(false)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(error.message)
    } else {
      const { data: userData } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, verification_status')
        .eq('id', userData?.user?.id)
        .single()

      if (profile?.role === 'tenant') {
        router.push('/')
      } else if (profile?.role === 'landlord') {
        router.push(profile?.verification_status === 'approved' ? '/dashboard' : '/dashboard/verify')
      } else {
        router.push('/')
      }
    }
    setLoading(false)
  }

  const handleGoogleAuth = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
  }

  const switchMode = (toSignup: boolean) => {
    router.push(toSignup ? '/login?mode=signup' : '/login')
    setSignupStep(1)
    setMessage('')
  }

  const steps = [
    { n: 1, label: 'Account Details' },
    { n: 2, label: 'Choose Role' },
    { n: 3, label: 'Verification', sub: '(Landlords only)' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        {/* Left panel */}
        <div
          className="hidden lg:flex flex-col justify-center relative p-12 bg-secondary"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.9)), url('/hero.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <span className="inline-flex w-fit items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full mb-6">
            <ShieldCheck size={14} />
            {isSignup ? 'Join thousands of trusted users' : 'Welcome back!'}
          </span>
          <h1 className="text-4xl font-extrabold text-foreground mb-3 leading-tight">
            {isSignup ? (
              <>Create your <span className="text-primary">EboHomes</span> account</>
            ) : (
              <>Login to <span className="text-primary">EboHomes</span></>
            )}
          </h1>
          <p className="text-muted-foreground text-lg mb-10 max-w-md">
            {isSignup
              ? "Whether you're looking for a home or listing your property, we've got you covered."
              : 'Access your account to discover, rent, and manage verified properties in Ebonyi State.'}
          </p>

          <div className="space-y-5 mb-8">
            {isSignup ? (
              <>
                {[
                  { icon: ShieldCheck, title: 'Verified & Secure', desc: 'Every landlord is verified. Your data is protected.' },
                  { icon: HomeIcon, title: 'Quality Homes', desc: 'Browse thousands of verified rentals in Ebonyi State.' },
                  { icon: Headphones, title: '24/7 Support', desc: 'Our support team is always here to help you.' },
                  { icon: LockIcon, title: 'Safe Platform', desc: 'We are committed to keeping renting safe and transparent.' },
                ].map((item) => (
                  <div key={item.title} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{item.title}</p>
                      <p className="text-muted-foreground text-xs">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                {[
                  { icon: ShieldCheck, title: 'Secure & Encrypted', desc: 'Your data is protected with 256-bit encryption.' },
                  { icon: User, title: 'Verified Platform', desc: 'Every landlord is verified to keep you safe from scams.' },
                  { icon: LockIcon, title: 'Protected Account', desc: 'We never share your information with third parties.' },
                ].map((item) => (
                  <div key={item.title} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{item.title}</p>
                      <p className="text-muted-foreground text-xs">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-4 max-w-sm flex items-start gap-3">
            <MessageCircle size={20} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Need help {isSignup ? 'signing up' : ''}?</p>
              <p className="text-xs text-muted-foreground mb-1">Chat with our support team on WhatsApp.</p>
              <a href="#" className="text-xs text-primary font-semibold hover:underline">Chat on WhatsApp →</a>
            </div>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            {isSignup ? (
              <>
                <h2 className="text-2xl font-bold text-foreground text-center mb-1">Create Account</h2>
                <p className="text-muted-foreground text-sm text-center mb-6">It only takes a few minutes</p>

                {/* Step indicator */}
                <div className="flex items-center justify-between mb-8">
                  {steps.map((step, i) => (
                    <div key={step.n} className="flex items-center flex-1">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            signupStep >= step.n
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {step.n}
                        </div>
                        <p className="text-[11px] text-center text-muted-foreground mt-1 whitespace-nowrap">
                          {step.label}
                          {step.sub && <span className="block">{step.sub}</span>}
                        </p>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-1 ${signupStep > step.n ? 'bg-primary' : 'bg-border'}`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* STEP 1 — Account Details */}
                {signupStep === 1 && (
                  <form onSubmit={handleStep1Continue}>
                    <h3 className="font-semibold text-foreground mb-1">Step 1: Account Details</h3>
                    <p className="text-xs text-muted-foreground mb-4">Tell us a bit about yourself</p>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                          <input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Enter your full name"
                            required
                            className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+234 801 234 5678"
                            required
                            className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>

                    <label className="text-sm font-medium text-foreground mb-1.5 block">Email Address</label>
                    <div className="relative mb-4">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email address"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Create a password"
                            required
                            className="w-full pl-9 pr-8 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">Confirm Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm your password"
                            required
                            className="w-full pl-9 pr-8 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-5 text-xs">
                      <span className={`flex items-center gap-1 ${passwordChecks.length ? 'text-primary' : 'text-muted-foreground'}`}>
                        <Check size={12} /> At least 8 characters
                      </span>
                      <span className={`flex items-center gap-1 ${passwordChecks.number ? 'text-primary' : 'text-muted-foreground'}`}>
                        <Check size={12} /> One number
                      </span>
                      <span className={`flex items-center gap-1 ${passwordChecks.uppercase ? 'text-primary' : 'text-muted-foreground'}`}>
                        <Check size={12} /> One uppercase letter
                      </span>
                      <span className={`flex items-center gap-1 ${passwordChecks.special ? 'text-primary' : 'text-muted-foreground'}`}>
                        <Check size={12} /> One special character
                      </span>
                    </div>

                    {message && <p className="text-sm text-destructive text-center mb-4">{message}</p>}

                    <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5">
                      Continue to Choose Role →
                    </Button>
                  </form>
                )}

                {/* STEP 2 — Choose Role */}
                {signupStep === 2 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Step 2: Choose Role</h3>
                    <p className="text-xs text-muted-foreground mb-4">How will you use EboHomes?</p>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {[
                        { value: 'tenant', label: "I'm a Tenant", desc: 'Find and rent a home', icon: User },
                        { value: 'landlord', label: "I'm a Landlord", desc: 'List properties for rent', icon: HomeIcon },
                      ].map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setRole(r.value)}
                          className={`text-left p-4 rounded-lg border-2 transition-colors ${
                            role === r.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary'
                          }`}
                        >
                          <r.icon size={20} className={role === r.value ? 'text-primary mb-2' : 'text-muted-foreground mb-2'} />
                          <p className="text-sm font-semibold text-foreground">{r.label}</p>
                          <p className="text-xs text-muted-foreground">{r.desc}</p>
                        </button>
                      ))}
                    </div>

                    {message && <p className="text-sm text-destructive text-center mb-4">{message}</p>}

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setSignupStep(1)} className="flex-1 font-semibold py-2.5">
                        Back
                      </Button>
                      <Button
                        type="button"
                        onClick={handleStep2Continue}
                        disabled={loading}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5"
                      >
                        {loading ? 'Please wait...' : role === 'landlord' ? 'Continue to Verification →' : 'Create Account'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 3 — Verification (landlord only) */}
                {signupStep === 3 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Step 3: Verification</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Landlords must verify ownership before listing properties
                    </p>

                    <div className="mb-4">
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Proof of Ownership</label>
                      <label className={`flex items-center gap-2 justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer text-sm transition-colors ${
                        ownershipDoc ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-secondary'
                      }`}>
                        {docUploading ? (
                          <span>Uploading...</span>
                        ) : ownershipDoc ? (
                          <><Check size={16} /> Document uploaded</>
                        ) : (
                          <><FileText size={16} /> Upload ownership/authorization document</>
                        )}
                        <input type="file" accept="image/*,application/pdf" onChange={handleDocUpload} className="hidden" />
                      </label>
                    </div>

                    <div className="mb-6">
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Face Verification (Selfie)</label>
                      {!selfieUrl ? (
                        !showCamera ? (
                          <button
                            type="button"
                            onClick={() => setShowCamera(true)}
                            className="w-full flex items-center gap-2 justify-center border-2 border-dashed border-border rounded-lg p-4 text-sm text-muted-foreground hover:bg-secondary transition-colors"
                          >
                            <Camera size={16} /> Open camera for selfie
                          </button>
                        ) : (
                          <div className="relative rounded-lg overflow-hidden">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg block" />
                            <button
                              type="button"
                              onClick={captureSelfie}
                              className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 rounded-full"
                            >
                              Capture
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="text-center">
                          <img src={selfieUrl} alt="Selfie" className="w-16 h-16 rounded-full object-cover border-2 border-primary mx-auto" />
                          <p className="text-xs text-primary mt-1">Selfie captured</p>
                          <button
                            type="button"
                            onClick={() => { setSelfieUrl(''); setShowCamera(false) }}
                            className="text-xs text-muted-foreground underline"
                          >
                            Retake
                          </button>
                        </div>
                      )}
                      <canvas ref={canvasRef} className="hidden" />
                    </div>

                    {message && (
                      <p className={`text-sm text-center mb-4 ${message.includes('created') ? 'text-primary' : 'text-destructive'}`}>
                        {message}
                      </p>
                    )}

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setSignupStep(2)} className="flex-1 font-semibold py-2.5">
                        Back
                      </Button>
                      <Button
                        type="button"
                        onClick={completeSignup}
                        disabled={loading}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5"
                      >
                        {loading ? 'Please wait...' : 'Complete Signup'}
                      </Button>
                    </div>
                  </div>
                )}

                <p className="text-center text-xs text-muted-foreground mt-6 flex items-center justify-center gap-1">
                  <ShieldCheck size={12} /> Your information is protected with 256-bit SSL encryption
                </p>

                <p className="text-center text-sm text-muted-foreground mt-4">
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchMode(false)} className="text-primary font-semibold hover:underline">
                    Log in
                  </button>
                </p>
              </>
            ) : (
              <>
                {/* LOGIN */}
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Lock size={22} className="text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">
                    Welcome back to <span className="text-primary">EboHomes</span>
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">Enter your details to continue</p>
                </div>

                <form onSubmit={handleLogin}>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Email address</label>
                  <div className="relative mb-4">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
                  <div className="relative mb-2">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-primary" />
                      Remember me
                    </label>
                    <Link href="/forgot-password" className="text-xs text-primary font-medium hover:underline">
                      Forgot password?
                    </Link>
                  </div>

                  {message && <p className="text-sm text-destructive text-center mb-4">{message}</p>}

                  <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5">
                    {loading ? 'Please wait...' : 'Sign In'}
                  </Button>

                  <div className="flex items-center gap-3 my-4">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">or continue with</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    className="w-full flex items-center justify-center gap-2 border border-border rounded-lg py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.12-.84 2.07-1.8 2.71v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.61z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.97H.96C.35 6.17 0 7.55 0 9s.35 2.83.96 4.03l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
                    Continue with Google
                  </button>

                  <div className="flex items-center justify-center gap-3 mt-4 bg-primary/5 rounded-lg py-2 text-[11px] text-primary font-medium">
                    <span className="flex items-center gap-1"><ShieldCheck size={12} /> Secure login</span>
                    <span>•</span>
                    <span>Encrypted</span>
                    <span>•</span>
                    <span>Verified platform</span>
                  </div>
                </form>

                <p className="text-center text-sm text-muted-foreground mt-5">
                  Don't have an account?{' '}
                  <button type="button" onClick={() => switchMode(true)} className="text-primary font-semibold hover:underline">
                    Create one
                  </button>
                </p>

                <div className="bg-card border border-border rounded-lg p-4 mt-6 flex items-start gap-3">
                  <MessageCircle size={20} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Need help?</p>
                    <p className="text-xs text-muted-foreground mb-1">Chat with our support team on WhatsApp.</p>
                    <a href="#" className="text-xs text-primary font-semibold hover:underline">Chat on WhatsApp →</a>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}