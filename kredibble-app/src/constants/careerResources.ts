import { useEffect, useState } from 'react';
import { getArticles } from '../lib/api';

// Career resource guides, as the server sends them. The list screen and the guide screen share them through this module, so a guide opened from the
// list is found by its id.
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

// The latest list (the API's when it answered), kept so the guide screen can find an article by id.
let current: CareerArticle[] = [];

export const getCareerArticle = (id: string): CareerArticle | undefined => current.find((article) => String(article.id) === id);

/** The guides to show: none until the API's guides arrive. */
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
        // Nothing to show when the API is not reachable.
      });
    return () => {
      active = false;
    };
  }, []);
  return articles;
}
