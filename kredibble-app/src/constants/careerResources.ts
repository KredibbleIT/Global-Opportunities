import { useEffect, useState } from 'react';
import { getArticles } from '../lib/api';

// Career resource guides: the sample guides below show until the API answers with real ones. The list screen and the guide screen share
// them through this module, so a guide opened from the list is found by its id.
export interface CareerArticle {
  id: string;
  category: string;
  title: string;
  duration: string;
  summary: string;
  content: string;
  imageUrl?: string;
  bannerImage?: string;
}

export const CAREER_CATEGORIES = ['Resume Writing', 'Interview Prep', 'Career Planning'];

export const CAREER_SAMPLE: CareerArticle[] = [
  {
    id: '1',
    category: 'Resume Writing',
    title: 'How to write a developer resume that gets noticed',
    duration: '5 min read',
    summary: 'Learn key formatting guidelines, action verbs, and structural details that make your engineering resume stand out to recruiters.',
    content: `Writing a great software developer resume is about demonstrating impact, not just listing technologies. Recruiters spend an average of 6 seconds scanning a CV. Here are key strategies to make your resume stand out:\n\n1. Keep it Concise\nLimit your resume to 1-2 pages maximum. Put your most impressive and recent experience at the top. Use clean layouts and bullet points for scan-readability.\n\n2. Focus on Impact\nUse the Action-Result format. Instead of saying "worked on the backend", say "Re-architected query layers, reducing search database latency by 40%". Quantify your accomplishments whenever possible.\n\n3. Match Job Keywords\nTailor your skills section to include language directly from the job description. Automated applicant tracking systems (ATS) look for matching terms to filter candidates.\n\n4. Link Projects & Portfolios\nEnsure your GitHub, personal portfolio website, and LinkedIn profiles are updated and hyperlinked. Live projects provide proof of your capabilities.`
  },
  {
    id: '2',
    category: 'Interview Prep',
    title: 'Mastering behavioral interviews: The STAR Method',
    duration: '8 min read',
    summary: 'A complete walkthrough of the Situation, Task, Action, and Result framework to successfully answer behavioral questions.',
    content: `Behavioral interview questions ("Tell me about a time you resolved a conflict...") are designed to predict future performance based on past actions. The STAR method is the gold standard for structuring answers:\n\n• Situation\nDescribe the context of the challenge you faced. Keep this concise and set the scene.\n\n• Task\nExplain your responsibility or the goal you needed to achieve in that situation.\n\n• Action\nOutline the exact steps you took to address the issue. Be specific about your contribution, even if it was a team project. Use "I did" instead of "We did".\n\n• Result\nState the outcome of your actions. Quantify achievements (e.g. saved 10 hours per week, increased sales by 15%) whenever possible.\n\nPractice beforehand by preparing 4-5 core stories that can adapt to different themes like leadership, technical difficulty, or handling failures.`
  },
  {
    id: '3',
    category: 'Career Planning',
    title: 'Top 10 skills for Product Designers in 2026',
    duration: '4 min read',
    summary: 'Discover the essential soft and technical skills required to remain competitive as a modern UI/UX and product designer.',
    content: `The landscape of digital design is evolving rapidly. To stand out as a Product Designer, focus on mastering these key pillars:\n\n1. Advanced Prototyping\nCreating interactive, high-fidelity micro-interactions inside tools like Figma to communicate design flows effectively.\n\n2. Design Systems Governance\nUnderstanding how to build, scale, and maintain shared component libraries that align with developer frameworks.\n\n3. Business and Product Strategy\nDesigning with metrics in mind. Knowing how your layouts impact conversion rates, retention, and business growth.\n\n4. Design Tokens & Code Literacy\nFamiliarity with CSS/React layouts to improve communication and handoff with developers.`
  }
];

// The latest list (the API's when it answered), kept so the guide screen can find an article by id.
let current: CareerArticle[] = CAREER_SAMPLE;

export const getCareerArticle = (id: string): CareerArticle | undefined => current.find((article) => String(article.id) === id);

/** The guides to show: the samples at first, the API's guides once they arrive. */
export function useCareerArticles(): CareerArticle[] {
  const [articles, setArticles] = useState<CareerArticle[]>(current);
  useEffect(() => {
    let active = true;
    getArticles()
      .then((data) => {
        if (!active || !data || data.length === 0) return;
        current = data.map((item: any) => ({
          ...item,
          id: String(item.id ?? item._id),
          imageUrl: item.imageUrl || item.coverImage || item.bannerImage,
          bannerImage: item.bannerImage || item.coverImage || item.imageUrl,
        })) as CareerArticle[];
        setArticles(current);
      })
      .catch(() => {
        // Keep the samples when the API is not reachable.
      });
    return () => {
      active = false;
    };
  }, []);
  return articles;
}
