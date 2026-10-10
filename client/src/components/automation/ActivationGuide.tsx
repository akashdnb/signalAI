import { Link } from "react-router-dom";
import { CheckCircleIcon, InstagramMarkIcon, SparkleIcon } from "../icons";

export function ActivationGuide({ onTemplates }: { onTemplates: () => void }) {
  const steps = [
    { title: "Connect Instagram", body: "Connect the professional account you want SignalAI to automate.", action: "Open Integrations", href: "../integrations" },
    { title: "Choose a preset", body: "Start with a proven comment-to-DM or lead qualification flow.", action: "Browse presets", onClick: onTemplates },
    { title: "Customize", body: "Tune the trigger, message, AI behavior and qualification goals in Builder.", action: "Done in Builder" },
    { title: "Publish & watch", body: "Activate the journey and verify the first real conversation in Inbox.", action: "Done after publish" },
  ];

  return (
    <section className="activation-guide" aria-labelledby="activation-guide-title">
      <div className="activation-guide__hero">
        <div className="activation-guide__icon"><InstagramMarkIcon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="activation-guide__eyebrow"><SparkleIcon className="h-3.5 w-3.5" /> FIRST AUTOMATION</div>
          <h2 id="activation-guide-title">Go from connected account to live automation in minutes.</h2>
          <p>Pick a preset, make it yours, publish it, then watch SignalAI handle the conversation.</p>
        </div>
      </div>
      <ol className="activation-guide__steps">
        {steps.map((step, index) => (
          <li key={step.title} className="activation-guide__step">
            <span className="activation-guide__number">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <strong>{step.title}</strong>
              <p>{step.body}</p>
              {step.onClick ? (
                <button type="button" onClick={step.onClick} className="activation-guide__action">{step.action} →</button>
              ) : step.href ? (
                <Link to={step.href} className="activation-guide__action">{step.action} →</Link>
              ) : (
                <span className="activation-guide__done"><CheckCircleIcon className="h-3.5 w-3.5" /> {step.action}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
