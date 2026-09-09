import React from "react";
import { motion } from "framer-motion";
import { Container, Star, Search, List } from "lucide-react";

interface SuggestedQueriesProps {
  onQueryClick: (query: string) => void;
}

/**
 * Suggested queries component
 * Shows clickable query suggestions to help users get started
 */
export const SuggestedQueries: React.FC<SuggestedQueriesProps> = ({
  onQueryClick,
}) => {
  const queries = [
    {
      icon: List,
      text: "List all containers",
      color: "blue",
    },
    {
      icon: Search,
      text: "Find my postgres container",
      color: "purple",
    },
    {
      icon: Star,
      text: "Show me my shortcuts",
      color: "yellow",
    },
    {
      icon: Container,
      text: "What containers are running?",
      color: "green",
    },
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case "blue":
        return "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400";
      case "purple":
        return "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-400";
      case "yellow":
        return "bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30 text-yellow-400";
      case "green":
        return "bg-green-500/10 hover:bg-green-500/20 border-green-500/30 text-green-400";
      default:
        return "bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/30 text-slate-400";
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 font-medium mb-3">
        Try asking me:
      </p>
      <div className="grid grid-cols-1 gap-2">
        {queries.map((query, index) => {
          const Icon = query.icon;
          return (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => onQueryClick(query.text)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${getColorClasses(query.color)}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{query.text}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

