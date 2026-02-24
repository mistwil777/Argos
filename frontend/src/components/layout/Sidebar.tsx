import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  BookOpen, 
  MessageSquare, 
  BarChart3, 
  Users, 
  Settings,
  Link2,
  HelpCircle
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, section: 'main' },
  { name: 'Items', href: '/items', icon: FileText, section: 'main', badge: 'Nouveau' },
  { name: 'Courses', href: '/courses', icon: BookOpen, section: 'main' },
  { name: 'RAG Assistant', href: '/rag', icon: MessageSquare, section: 'main' },
  { name: 'Guide', href: '/guide', icon: HelpCircle, section: 'help' },
  { name: 'Sources', href: '/sources', icon: Link2, section: 'config' },
  { name: 'HITL', href: '/hitl', icon: Users, section: 'config' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, section: 'config' },
  { name: 'Admin', href: '/admin', icon: Settings, section: 'config' },
];

const sections = [
  { id: 'main', label: 'Principal' },
  { id: 'help', label: 'Aide' },
  { id: 'config', label: 'Configuration' },
];

export const Sidebar = () => {
  const location = useLocation();
  
  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 bg-gray-800">
        <h1 className="text-xl font-bold text-white">AcademiaOps</h1>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.id} className="mb-6">
            <h3 className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {section.label}
            </h3>
            {navigation
              .filter((item) => item.section === section.id)
              .map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </div>
                    {item.badge && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500 text-white rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
      
      {/* Footer */}
      <div className="border-t border-gray-800 p-4">
        <p className="text-xs text-gray-400">
          v1.0.0 • {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};
