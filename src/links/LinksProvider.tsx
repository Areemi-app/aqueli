/** Liens entre éléments, chargés une fois le compte déverrouillé ; ajout et retrait avec Ctrl+Z. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { linkedTo, linkOf, linksApi, sameLink, type ItemRef, type Link } from "./links";
import { tr } from "../i18n/i18n";

interface LinksContextValue {
  links: readonly Link[];
  /** Éléments reliés à `item`. */
  linked: (item: ItemRef) => ItemRef[];
  link: (a: ItemRef, b: ItemRef) => Promise<void>;
  unlink: (a: ItemRef, b: ItemRef) => Promise<void>;
}

const LinksContext = createContext<LinksContextValue | null>(null);

export function LinksProvider({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<Link[]>([]);
  const notify = useToast();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  useEffect(() => {
    linksApi
      .list()
      .then(setLinks)
      .catch((err: DataError) => notify(dataErrorMessage(err)));
  }, [notify]);

  const value = useMemo<LinksContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const link = async (a: ItemRef, b: ItemRef) => {
      const l = linkOf(a, b);
      setLinks((list) => (list.some((x) => sameLink(x, l)) ? list : [...list, l]));
      try {
        await enqueue(() => linksApi.add(l));
        recordUndo(tr("ajout du lien"), () => unlink(a, b));
      } catch (err) {
        setLinks((list) => list.filter((x) => !sameLink(x, l)));
        fail(err);
      }
    };
    const unlink = async (a: ItemRef, b: ItemRef) => {
      const l = linkOf(a, b);
      setLinks((list) => list.filter((x) => !sameLink(x, l)));
      try {
        await enqueue(() => linksApi.remove(l));
        recordUndo(tr("retrait du lien"), () => link(a, b));
      } catch (err) {
        fail(err);
      }
    };
    return { links, linked: (item) => linkedTo(links, item), link, unlink };
  }, [links, enqueue, notify]);

  return <LinksContext.Provider value={value}>{children}</LinksContext.Provider>;
}

export function useLinks(): LinksContextValue {
  const ctx = useContext(LinksContext);
  if (!ctx) throw new Error("useLinks doit être utilisé dans LinksProvider");
  return ctx;
}

export function useLinksIfAny(): LinksContextValue | null {
  return useContext(LinksContext);
}
