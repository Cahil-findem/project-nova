import {
  ArrowUpIcon,
  LightbulbIcon,
  MicIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import React, { useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export const AiInput = (): JSX.Element => {
  const [inputValue, setInputValue] = useState("");

  // Data for buttons to enable mapping
  const leftButtons = [
    { icon: <PlusIcon className="h-4 w-4" />, label: null },
    { icon: <SlidersHorizontalIcon className="h-4 w-4" />, label: null },
  ];

  return (
    <Card className="w-[680px] rounded-2xl border border-[#dcdfea] bg-basewhite p-0 overflow-hidden">
      <CardContent className="flex flex-col items-start justify-center gap-4 pt-4 pb-3 px-3">
        <div className="flex items-center gap-2 w-full relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Describe who you are looking for"
            className="flex-1 bg-transparent border-none outline-none font-text-lead text-layout-v2title-text text-[length:var(--text-lead-font-size)] tracking-[var(--text-lead-letter-spacing)] leading-[var(--text-lead-line-height)] [font-style:var(--text-lead-font-style)] placeholder:text-layout-v2muted-text"
          />
        </div>

        <div className="flex items-center gap-2 w-full">
          <div className="flex items-center gap-1 flex-1">
            {leftButtons.map((btn, index) =>
              <Button
                key={`left-btn-${index}`}
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-[36px] border-[#eaecf0]"
              >
                {btn.icon}
              </Button>
            )}
          </div>

          <div className="flex items-center justify-end gap-1 flex-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-[36px] border-[#eaecf0]"
            >
              <MicIcon className="h-4 w-4 text-layout-v2secondary-title" />
            </Button>

            <Button
              size="icon"
              className="h-8 w-8 rounded-[36px] bg-[#bdd7f6] hover:bg-[#a9c9f2]"
            >
              <ArrowUpIcon className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
