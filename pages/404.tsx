import { useEffect } from "react";

// Unknown URLs go home. A full navigation, not router.replace: with a
// middleware present, Next 13.1 turns that client transition into a data fetch
// for the dynamic route the URL resembles (/writing/[slug]) and the page then
// crashes on the missing props instead of redirecting.
export default function Custom404() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return null;
}
