import { useEffect, useState } from "react";

const MESSAGES = [
  {
    text: "Un projet prend vie quand on avance ensemble.",
    color: "blue",
  },
  {
    text: "Votre soutien donne aux idées les moyens de grandir.",
    color: "orange",
  },
  {
    text: "Ensemble, transformons les idées en réalisations.",
    color: "navy",
  },
  {
    text: "Chaque contribution compte dans une aventure collective.",
    color: "blue",
  },
  {
    text: "Un geste de soutien peut ouvrir de nouvelles possibilités.",
    color: "orange",
  },
  {
    text: "Faisons grandir les projets qui nous rassemblent.",
    color: "navy",
  },
];

export default function EncouragementMessage() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((previous) => (
        (previous + 1) % MESSAGES.length
      ));
    }, 4000);

    return () => window.clearInterval(timer);
  }, []);

  const message = MESSAGES[index];

  return (
    <div className="companion-message">
      <p
        key={index}
        className={
          `companion-message-text ` +
          `companion-message-text--${message.color}`
        }
      >
        {message.text}
      </p>
    </div>
  );
}