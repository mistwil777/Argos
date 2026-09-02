import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #08111e 0%, #0d1a2e 50%, #091524 100%)' }}>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-4 mb-10"
      >
        <motion.img
          src="/favicon.svg" alt="Argos" className="w-14 h-14"
          style={{ filter: 'drop-shadow(0 0 20px rgba(0,180,225,.45))' }}
          whileHover={{ scale: 1.05 }}
        />
        <div>
          <p className="text-[32px] font-bold text-white tracking-tight leading-none">Argos</p>
          <p className="text-[10.5px] font-mono text-[#00B4E1] tracking-[0.2em] uppercase mt-0.5">Intelligence Platform</p>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-[14px] text-[#5C6E82] mb-11"
      >
        Choisissez votre espace de travail.
      </motion.p>

      {/* Cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.4 }}
        className="flex gap-5"
      >
        {/* Perso */}
        <motion.button
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          onClick={() => navigate('/briefing')}
          className="w-60 text-left rounded-2xl border p-7 flex flex-col gap-2.5 cursor-pointer transition-colors"
          style={{ background: '#141B27', borderColor: '#2C3A50' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#0070AD'; (e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px rgba(0,112,173,.2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2C3A50'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-0.5"
            style={{ background: 'rgba(0,112,173,.12)' }}>👤</div>
          <p className="text-[18px] font-bold text-white">Perso</p>
          <p className="text-[12.5px] text-[#5C6E82] leading-relaxed">Votre espace de veille et d'apprentissage personnel.</p>
          <div className="mt-1 space-y-1.5">
            {['Veille par sujets', 'Briefing quotidien', 'Librairie personnelle'].map(l => (
              <div key={l} className="flex items-center gap-2 text-[11.5px] text-[#899AB0]">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#0070AD', opacity: 0.7 }} />
                {l}
              </div>
            ))}
          </div>
          <div className="mt-3 py-2.5 rounded-lg text-center text-[13px] font-semibold text-[#00B4E1]"
            style={{ background: 'rgba(0,112,173,.12)' }}>
            Accéder à mon espace →
          </div>
        </motion.button>

        {/* Projet */}
        <motion.button
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          onClick={() => navigate('/projets')}
          className="w-60 text-left rounded-2xl border p-7 flex flex-col gap-2.5 cursor-pointer transition-colors"
          style={{ background: '#141B27', borderColor: '#2C3A50' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d17c00'; (e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px rgba(209,124,0,.15)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2C3A50'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-0.5"
            style={{ background: 'rgba(209,124,0,.10)' }}>📁</div>
          <p className="text-[18px] font-bold text-white">Projet</p>
          <p className="text-[12.5px] text-[#5C6E82] leading-relaxed">Espace de veille partagé pour un projet d'équipe.</p>
          <div className="mt-1 space-y-1.5">
            {['Sujets et sources dédiés', 'Bibliothèque projet', 'Membres et rôles'].map(l => (
              <div key={l} className="flex items-center gap-2 text-[11.5px] text-[#899AB0]">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#d17c00', opacity: 0.7 }} />
                {l}
              </div>
            ))}
          </div>
          <div className="mt-3 py-2.5 rounded-lg text-center text-[13px] font-semibold text-[#f59e0b]"
            style={{ background: 'rgba(209,124,0,.10)' }}>
            Mes projets →
          </div>
        </motion.button>
      </motion.div>

      {/* Credit line */}
      <div className="fixed bottom-0 left-0 right-0 h-7 flex items-center justify-center gap-4"
        style={{ background: '#0A1628', borderTop: '1px solid #1E3A5F' }}>
        <img src="/capgemini-logo.png" alt="Capgemini" className="h-3.5 opacity-50" />
        <p className="text-[10.5px] font-mono text-[#4A7FA0]">
          Argos — Conceived, designed and built by{' '}
          <span className="text-[#00B4E1] font-semibold">Wilfried Leroulier</span>
          <span className="mx-2 text-[#1E3A5F]">|</span>
          <span className="text-[#4A7FA0]">A Capgemini Initiative</span>
        </p>
      </div>
    </div>
  )
}
