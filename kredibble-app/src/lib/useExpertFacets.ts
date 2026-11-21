import { useEffect, useState } from 'react';
import { getExpertFacets } from './api';

/** The professions and countries of the listed experts (nothing until they load, or when the server cannot be reached). */
export function useExpertFacets() {
  const [facets, setFacets] = useState<{ professions: string[]; countries: string[] }>({ professions: [], countries: [] });
  useEffect(() => {
    let active = true;
    getExpertFacets()
      .then((data) => { if (active) setFacets({ professions: data.professions ?? [], countries: data.countries ?? [] }); })
      .catch(() => { /* the filter simply has no choices to offer */ });
    return () => { active = false; };
  }, []);
  return facets;
}
