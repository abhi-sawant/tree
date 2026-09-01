// The manual, bundled.
//
// "Works fully offline" is the app's defining property, and it rules out the
// usual answer to somebody being stuck: a link to a wiki. Nothing here is
// fetched, so the help is as available as the data it describes — on a train,
// on a laptop that has never been online, six years from now.
//
// Prose lives here as data rather than as JSX for three reasons: it can be
// searched (see searchHelp), it renders through the same Markdown walker a
// person's notes do, and it can be *tested*. The tests beside this file check
// the claims that are checkable — that every number quoted matches the constant
// it describes, and that every keyboard shortcut listed is one the app
// actually binds. A manual that has quietly gone out of date is worse than no
// manual, because it is believed.
//
// Numbers are written into the prose rather than interpolated from the modules
// that own them, and pinned by a test instead. That is the same arrangement as
// the theme script in index.html: a content module that imported Dexie to
// quote a retention limit would be the wrong shape entirely, and a test that
// fails the moment the two disagree costs nothing.

import { ADD_RELATIVE_KEYS } from "~/lib/canvas/keyboard-navigation"

export interface HelpShortcut {
  // Written as the reader would press it. Shown in a key-cap style.
  keys: string
  description: string
}

export interface HelpSection {
  heading: string
  // Markdown, in the same subset a person's notes accept.
  body: string
  shortcuts?: HelpShortcut[]
}

export interface HelpTopic {
  id: string
  title: string
  // One line, shown in the topic list and searched alongside the body.
  summary: string
  sections: HelpSection[]
}

// The add-relative keys are derived from the bindings rather than restated, so
// the manual cannot fall behind the keyboard. The Record is exhaustive over the
// bindings' *values*, so adding a fourth shortcut fails to compile until it is
// described here — a compile error rather than an out-of-date page.
const ADD_RELATIVE_DESCRIPTION: Record<
  (typeof ADD_RELATIVE_KEYS)[keyof typeof ADD_RELATIVE_KEYS],
  string
> = {
  "add-parent": "Add a parent to the selected person",
  "add-spouse": "Add a spouse",
  "add-child": "Add a child",
}

const ADD_RELATIVE_SHORTCUTS: HelpShortcut[] = Object.entries(
  ADD_RELATIVE_KEYS
).map(([key, kind]) => ({
  keys: key.toUpperCase(),
  description: ADD_RELATIVE_DESCRIPTION[kind],
}))

// Markdown source assembled from wrapped source lines.
//
// parseNotes closes a list on the first line that isn't a bullet, so a list
// item written across two lines would reach the renderer as a list, a stray
// paragraph and a second list — prose that looks right in the source and wrong
// on screen. Rather than write every bullet as one very long string literal, a
// line indented by two spaces is folded onto the one before it here.
//
// Paragraph lines need no help: parseNotes already joins them with a space.
// Only list items are affected, which is why the continuation marker is
// explicit rather than inferred.
function md(lines: string[]): string {
  const out: string[] = []
  for (const line of lines) {
    if (/^ {2}\S/.test(line) && out.length > 0) {
      out[out.length - 1] += ` ${line.trim()}`
    } else {
      out.push(line)
    }
  }
  return out.join("\n")
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "One pool of people, any number of trees over it.",
    sections: [
      {
        heading: "People exist once; trees are views over them",
        body: md([
          "Everybody you enter goes into a single pool, and a **tree** is a",
          "named view over part of it. The same grandmother can appear in your",
          "tree, your cousin's tree and a tree about one village, and she is",
          "one record in all three — correct her dates once and she is",
          "corrected everywhere.",
          "",
          "Two consequences worth knowing before you start:",
          "",
          "- **Relationships are global.** If you record that A is B's parent,",
          "  that holds in every tree. A tree only decides who is *shown*.",
          "- **Removing from a tree is not deleting.** They are two different",
          "  actions with two different buttons. Removing takes a card off one",
          "  canvas; deleting removes the person, their relationships and their",
          "  photos from everywhere.",
        ]),
      },
      {
        heading: "Your first tree",
        body: md([
          "Every tree has a **root** — the person it is anchored on and laid",
          "out around. Pick whoever the tree is about; you can change it later",
          "from the tree menu in the top bar.",
          "",
          "Then select their card and build outwards. Each add-relative action",
          "creates the person and the relationship in one step, so you never",
          "have to make somebody and then join them up.",
          "",
          "If you would rather see a finished tree first, Settings offers a",
          "sample family of invented people that you can remove in one click.",
        ]),
      },
      {
        heading: "Nothing leaves this device",
        body: md([
          "There is no account and no server. Everything lives in this",
          "browser's storage on this machine, which is why the app works with",
          "no connection at all — there is nothing to be offline from.",
          "",
          "That is also why **you own the backups**. See *Keeping your data",
          "safe*, which is the most important page here.",
        ]),
      },
    ],
  },

  {
    id: "fast-entry",
    title: "Entering people quickly",
    summary: "Shortcuts, drag-to-connect, whole families in one form.",
    sections: [
      {
        heading: "The keyboard",
        body: md([
          "Select a card on the canvas and the keyboard drives the rest. The",
          "arrow keys follow what is on screen rather than a fixed idea of",
          "which way is up: in a left-to-right layout the parents really are",
          "to the left, so that is where the left arrow goes.",
          "",
          "None of these fire while you are typing in a field, so a name",
          "beginning with P is safe.",
        ]),
        shortcuts: [
          { keys: "↑ ↓ ← →", description: "Walk to a parent, child or spouse" },
          {
            keys: "Enter",
            description: "Put the cursor in the selected person's name",
          },
          ...ADD_RELATIVE_SHORTCUTS,
          { keys: "⌘K / Ctrl+K", description: "Search everyone by name" },
          { keys: "?", description: "Open this help" },
          { keys: "Esc", description: "Close a dialog or the search" },
        ],
      },
      {
        heading: "Adding a sibling",
        body: md([
          "*Add sibling* is on the card's own buttons and its context menu but",
          "deliberately has no keyboard shortcut. A sibling is a child of the",
          "same parents, so when no parents are recorded the app has to invent",
          "a placeholder parent to hang the pair from — and a single unmodified",
          "keystroke should not be able to conjure a person nobody asked for.",
          "",
          "A placeholder is a real record with a badge on it. Fill in a name",
          "when you know one, and the badge goes.",
        ]),
      },
      {
        heading: "Dragging a link between two people",
        body: md([
          "Every card has small handles on its edges. Drag from one person's",
          "handle to another's to record a relationship without opening a",
          "form: the handles along the sides mean a marriage, and the ones at",
          "the top and bottom mean parent and child.",
          "",
          "A drag that names a real relationship always lands. If it cannot be",
          "recorded you are told why — the pair are already related, the child",
          "already has two parents, or the link would make somebody their own",
          "ancestor.",
        ]),
      },
      {
        heading: "A whole family at once",
        body: md([
          "*Add whole family* takes a spouse and any number of children in one",
          "submit, which is the shape a family usually arrives in: somebody",
          "reads a record and knows that these two had these four children.",
          "",
          "Children are recorded in the order you type them, so enter them",
          "eldest first and the canvas will draw them that way. If the couple",
          "are already married the app does not record a second marriage.",
        ]),
      },
      {
        heading: "Several cards at once, and the table",
        body: md([
          "Shift-click or ⌘-click cards to select several, and a strip appears",
          "above the canvas: add or remove them from the tree together, or",
          "align them into a row or column.",
          "",
          "For long stretches of typing, the **People** view is a table of the",
          "whole pool where names and years can be edited in place. Editing a",
          "date cell there changes the year and keeps the month, day and any",
          "*circa* marking; emptying it clears the date altogether.",
        ]),
      },
    ],
  },

  {
    id: "dates",
    title: "Dates you aren't sure about",
    summary: "Bare years, circa dates, and why the app stays quiet.",
    sections: [
      {
        heading: "A year on its own is a real answer",
        body: md([
          "Every date here can be as vague as your source. A year with no",
          "month, a month with no day, or nothing at all are all valid, and",
          "none of them is stored as a guess at the missing parts.",
          "",
          "Tick **approximate** for a *circa* date. It is shown as `c. 1892`,",
          "and it widens what the app is willing to conclude from it.",
        ]),
      },
      {
        heading: "Why some comparisons say nothing",
        body: md([
          "A date is treated as a *span*, not a point: “1950” means the whole",
          "of 1950, and an approximate date is wider still. Anywhere the app",
          "would have to pick a point inside that span to reach a conclusion,",
          "it declines to reach one.",
          "",
          "So the Health view will not tell you a parent was too young when",
          "the dates could go either way. A false accusation about somebody's",
          "family is much worse than a missed one, because you cannot tell",
          "them apart by looking.",
          "",
          "Two places deliberately estimate instead, and say so: the",
          "**Insights** statistics, which use plain year arithmetic and report",
          "how large the sample was, and sorting, which has to put every row",
          "somewhere.",
        ]),
      },
      {
        heading: "Anniversaries need a full date",
        body: md([
          "Birthdays and wedding anniversaries need a month and a day, and",
          "reject approximate dates — “c. 3 May 1890” is saying the day is a",
          "guess. People recorded with only a year are left out rather than",
          "given an invented day.",
          "",
          "29 February is shown on 1 March in other years, on the grounds that",
          "an anniversary appearing one year in four serves nobody.",
        ]),
      },
    ],
  },

  {
    id: "relationships",
    title: "Relationships",
    summary: "Marriages, adoptions, twins, and the two-parent limit.",
    sections: [
      {
        heading: "How a parent-child link came about",
        body: md([
          "A parent-child link can be recorded as biological, adopted, step,",
          "foster or guardian. Left alone it means biological.",
          "",
          "It is not decoration. Anything but biological draws a dashed line;",
          "a step-parent or guardian is allowed to be younger than the child,",
          "so the Health view stops complaining about the ages; and only",
          "biological and adopted links have anywhere to go in a GEDCOM file.",
        ]),
      },
      {
        heading: "Marriages and the dot between them",
        body: md([
          "A married couple are joined by a small dot, and their children hang",
          "off that dot rather than off each parent. It is what makes",
          "“children of this marriage” unambiguous when somebody married",
          "twice.",
          "",
          "Record an end date on a marriage — a divorce or a separation — and",
          "the line is drawn dashed and the dot becomes a hollow ring, so a",
          "couple drawn far apart still reads correctly.",
        ]),
      },
      {
        heading: "At most two parents",
        body: md([
          "A person can have two parents recorded. Adoptive and biological",
          "parents both being known is a real situation the app cannot yet",
          "hold, and refusing is better than silently keeping whichever two",
          "were entered first.",
          "",
          "To change a parent, remove the existing link and add the new one.",
        ]),
      },
      {
        heading: "Twins",
        body: md([
          "Marking people as a multiple birth keeps them side by side on the",
          "canvas even when another sibling was recorded between them, and",
          "puts a small icon on their cards. Triplets and more work the same",
          "way, and the grouping survives one of them being deleted.",
        ]),
      },
    ],
  },

  {
    id: "data-safety",
    title: "Keeping your data safe",
    summary: "The one page to read. Browsers can throw this data away.",
    sections: [
      {
        heading: "The risk, plainly",
        body: md([
          "Your family tree is in this browser's storage, and browser storage",
          "is not permanent. iOS Safari may clear it after about a week",
          "without a visit. Any browser may clear it under storage pressure.",
          "Clearing “site data” or “cookies and cached files” takes it too.",
          "",
          "An afternoon of work can disappear with no warning and no undo.",
          "Everything below exists because of that one sentence.",
        ]),
      },
      {
        heading: "Export a backup, and keep it somewhere else",
        body: md([
          "The **backup** is a `.zip` holding every person, relationship,",
          "tree, photo and document. It is the complete copy, it is the only",
          "thing that survives this browser being wiped, and it is yours —",
          "put it in the place you keep things you would be upset to lose.",
          "",
          "Importing one **replaces** everything currently stored, so it is",
          "how you move to a new machine or recover from a loss, not how you",
          "merge two collections.",
          "",
          "The sidebar shows the date of your last backup. If it goes more",
          "than 30 days without one, a banner says so; *Later* quiets it for",
          "7 days, and exporting clears it.",
        ]),
      },
      {
        heading: "Snapshots undo mistakes, not disasters",
        body: md([
          "The app keeps up to 10 rollback points automatically as you work,",
          "no closer together than 10 minutes apart — so that between them",
          "they cover a whole session rather than its last few minutes. Roll",
          "back to any of them from Settings.",
          "",
          "A rollback is itself undoable: a snapshot of the current state is",
          "taken first.",
          "",
          "Snapshots leave photos out. Photos are nearly all of the bytes and",
          "nearly none of the risk, and keeping a copy of every photo in every",
          "rollback point would multiply your storage use many times over in",
          "exactly the place the danger is. So somebody brought back by a",
          "rollback comes back without their picture.",
          "",
          "Snapshots live in the same storage as everything else. They protect",
          "you from a wrong merge or a mistaken delete — **not** from the",
          "browser clearing its data. Only an exported backup does that.",
        ]),
      },
      {
        heading: "Backing up to a folder automatically",
        body: md([
          "On a browser that supports it, you can point the app at a folder on",
          "your machine and it will write a full backup there as you work —",
          "one file per day, and it never deletes an old one.",
          "",
          "The permission cannot be re-acquired silently, so after restarting",
          "your browser you will need to reconnect the folder once. If a write",
          "fails — an unplugged drive, a folder that has moved — Settings says",
          "so, because a backup that silently does nothing is the worst",
          "failure this feature could have.",
        ]),
      },
      {
        heading: "Two tabs open",
        body: md([
          "A second tab is fine; both stay in step. You will see a quiet note",
          "saying so.",
          "",
          "A *restore* in another tab is not fine, and gets a red banner",
          "demanding a reload: everything on screen is now describing data",
          "that no longer exists, and editing it would write the old records",
          "back over the restored ones.",
        ]),
      },
      {
        heading: "Install it",
        body: md([
          "Installing the app asks the browser to exempt its data from being",
          "cleared under pressure, which is granted automatically to installed",
          "apps. Settings shows whether that has been granted, along with how",
          "much space everything is using.",
        ]),
      },
    ],
  },

  {
    id: "sharing",
    title: "Sharing and printing",
    summary: "Pictures, PDFs, GEDCOM, spreadsheets, calendars.",
    sections: [
      {
        heading: "A picture of the canvas",
        body: md([
          "**PNG** and **PDF** in the Tree view's export menu capture the",
          "canvas as it looks right now, including anything scrolled off",
          "screen. What you have hidden, focused or coloured is what you get,",
          "which is the point: arrange the tree until it reads well, then",
          "export that.",
        ]),
      },
      {
        heading: "A family book",
        body: md([
          "The **family book** is a multi-page PDF: a title page, a table of",
          "contents, then a page per person with their dates, their",
          "relatives, their notes, their photo and a list of their documents.",
          "Nobody is cut off at the bottom of a page — a long note simply",
          "takes two.",
          "",
          "It covers the open tree rather than everybody in the pool, because",
          "a book is a document about one family.",
          "",
          "Names in a non-Latin script cannot yet be drawn in it. The PDF's",
          "built-in fonts do not contain those letters, and shipping a font",
          "that does would add megabytes to an app that has to work offline.",
        ]),
      },
      {
        heading: "GEDCOM, for other genealogy software",
        body: md([
          "**GEDCOM 5.5.1** is the interchange format every other family tree",
          "program reads. Export it as plain text, or as a `.zip` with the",
          "photos alongside.",
          "",
          "Documents are not included either way. GEDCOM 5.5.1 has no media",
          "type for a PDF, and importers tend to drop an attachment they",
          "cannot classify — so a scan sent that way would usually vanish",
          "while appearing to have been included.",
          "",
          "Importing GEDCOM is not supported yet. Reading the file is easy;",
          "deciding which of the imported people are already in your pool is",
          "the hard part, and it needs a review screen of its own.",
        ]),
      },
      {
        heading: "Spreadsheets",
        body: md([
          "The **CSV** export is one row per person, with parents and spouses",
          "referred to *by name* — the shape families already keep this data",
          "in, and nobody types an identifier into a spreadsheet.",
          "",
          "Importing one **adds** to what is here: it creates people, updates",
          "the ones it carries an identifier for, and only ever adds links,",
          "never removes them. It carries names, sex, dates and notes, so",
          "photos, custom fields, marriage dates and adoption details are",
          "untouched by a round trip — which is safe precisely because the",
          "import cannot damage the fields it cannot see.",
          "",
          "Anything it could not do is reported beside the counts. A name",
          "matching nobody is a typo; a name matching two people is a choice",
          "only you can make.",
        ]),
      },
      {
        heading: "Calendars",
        body: md([
          "The **.ics** export puts birthdays and wedding anniversaries into",
          "any calendar app as yearly all-day events.",
          "",
          "It carries births and marriages only. A recurring reminder of the",
          "day somebody died is a different kind of thing, and it should not",
          "arrive in a calendar unasked.",
        ]),
      },
      {
        heading: "Withholding living people",
        body: md([
          "**Redact living people** rewrites anyone the app cannot show to be",
          "dead as “Living” plus their surname, with no dates, notes or",
          "photos. It applies to GEDCOM, the family book and the canvas",
          "image — and *not* to the backup, which is your own complete copy.",
          "",
          "Anything undecidable is withheld, including somebody with no dates",
          "at all. Wrongly hiding a dead person's dates costs a reader one",
          "lookup; wrongly publishing a living person's costs them something",
          "they cannot take back. Somebody born more than 100 years ago is",
          "presumed to have died.",
          "",
          "The surname is kept, because a chart of twenty identical cards is",
          "unreadable and a surname protects almost nothing in a document that",
          "is a family tree. The count of who is being withheld is shown",
          "beside the switch and printed on the book's title page.",
        ]),
      },
    ],
  },

  {
    id: "photos-and-documents",
    title: "Photos and documents",
    summary: "Faces the app draws, and files it only ever hands back.",
    sections: [
      {
        heading: "Several photos per person",
        body: md([
          "A person can hold as many photos as you like, in an order you",
          "choose. The first is the **cover** — the one the card on the canvas",
          "and every list draws. Add the rest from the person's detail panel,",
          "where reordering and *Make cover* take effect immediately rather",
          "than waiting for a save.",
          "",
          "Uploads are shrunk to 800px on the longest edge and re-encoded, so",
          "a modern phone photo lands as tens of kilobytes rather than",
          "several megabytes. That matters more here than image quality does:",
          "browser storage is finite, and it is the thing most likely to lose",
          "your tree.",
        ]),
      },
      {
        heading: "Scans and certificates",
        body: md([
          "**Documents** are a separate list on each person, for a birth",
          "certificate, a will, a letter, a page of a register. PDFs and",
          "images, up to 25 MB a file.",
          "",
          "Unlike a photo, a document is never shrunk — the whole point of a",
          "scan is that the small print stays readable — and it is handed back",
          "byte for byte identical to the file you added. The app does not try",
          "to be a viewer for them; your browser already has a better one.",
          "",
          "Because they are stored at full size, documents are left out of",
          "snapshots and out of GEDCOM exports. The complete backup carries",
          "them.",
        ]),
      },
      {
        heading: "The photo wall",
        body: md([
          "**Photo wall** shows one face per person, with a badge when there",
          "are more, ordered by birth so the wall reads as generations.",
          "",
          "It shows only the people who have a photo, and says how many it",
          "left out — “34 of 112 people have a photo” is the number that tells",
          "you where the gaps are. A wall of identical default avatars would",
          "say nothing about who is missing and bury the ones that matter.",
        ]),
      },
      {
        heading: "Where the space is going",
        body: md([
          "Settings reports two numbers and refuses to reconcile them: what",
          "the browser says this whole site is using, which is padded and",
          "covers more than your family data, and the exact measured size of",
          "the photo and document libraries. Presenting either one as “the",
          "size of your family tree” would be a precise-looking lie.",
          "",
          "It also lists the largest files and who they belong to, and reports",
          "any photo whose owner has gone — without deleting it, because a",
          "blob whose person might still be recoverable is not the storage",
          "panel's to throw away.",
        ]),
      },
    ],
  },

  {
    id: "canvas",
    title: "Making the canvas readable",
    summary: "Focus, bloodline, direction, colour, and pinned cards.",
    sections: [
      {
        heading: "Showing less",
        body: md([
          "- **Focus** narrows the canvas to one person's ancestors,",
          "  descendants or both, to a chosen number of generations. The tree",
          "  is laid out again from just those people, so the result is",
          "  compact rather than the full tree with holes in it.",
          "- **Generations** hides whole rows without moving anything, so",
          "  turning one off and on again leaves the tree exactly as it was.",
          "- **Bloodline** glows the line of descent from the person you have",
          "  selected up to the tree's root. It never follows a marriage — a",
          "  marriage is not a step in a line of descent.",
        ]),
      },
      {
        heading: "Shape and colour",
        body: md([
          "*Customize* holds the rest: top-to-bottom or left-to-right layout,",
          "the connector shape, card size and spacing, which of photo, dates",
          "and name each card shows, and whether cards are coloured by",
          "generation, by surname or by branch.",
          "",
          "“Branch” means which of the root person's children somebody",
          "descends from. Not “their oldest ancestor” — everybody has two",
          "lineages, so any single answer to that would be an arbitrary pick",
          "presented as a fact.",
        ]),
      },
      {
        heading: "Moving cards yourself",
        body: md([
          "Dragging a card pins it: automatic layout stops moving that one,",
          "and a pin icon appears on it. **Re-layout** releases every pinned",
          "card in the tree, and a card's own context menu releases just it.",
          "",
          "Pins belong to one layout direction. Switching direction leaves",
          "them in place rather than throwing away positions you chose by",
          "hand, so you may need to re-layout after switching.",
        ]),
      },
      {
        heading: "Reading the tree as a list",
        body: md([
          "**Outline** puts the same tree beside the canvas as a nested list:",
          "each person, then who they married, then the children of that",
          "couple, indented one level per generation. Selecting an entry",
          "selects the card and scrolls to it.",
          "",
          "It exists because everything that makes a canvas readable — what is",
          "above what, which line goes where — is geometry, and a screen",
          "reader cannot see geometry. Cards are labelled with their dates and",
          "their relatives so each one can be described; the outline is how the",
          "*shape* can be read. It is a normal panel rather than a hidden one,",
          "because it is just as useful for finding somebody in a large tree",
          "with the keyboard.",
          "",
          "It follows whatever the canvas is showing, so a focus view or a",
          "hidden generation narrows the list too.",
        ]),
      },
      {
        heading: "Light and dark",
        body: md([
          "The theme follows your system by default and can be set to light",
          "or dark in Settings. It is applied before the page draws, so",
          "choosing dark does not mean a white flash on every load.",
        ]),
      },
    ],
  },

  {
    id: "tidying",
    title: "Finding and fixing problems",
    summary: "The Health view, duplicates, and merging two records.",
    sections: [
      {
        heading: "The Health view",
        body: md([
          "**Health** checks the whole pool and reports two kinds of thing.",
          "",
          "*Errors* are contradictions: a death before a birth, a child born",
          "before their parent, a marriage after somebody died. One of these",
          "means a date is wrong somewhere.",
          "",
          "*Warnings* are gaps rather than mistakes: a placeholder still",
          "waiting for a name, somebody in no tree at all, a missing birth",
          "year. A tree with warnings is a normal tree.",
        ]),
      },
      {
        heading: "Duplicates",
        body: md([
          "The duplicate finder looks for the same person entered twice —",
          "which happens easily when two branches of a family are typed up in",
          "different sittings.",
          "",
          "It is deliberately cautious, and what it refuses to flag matters",
          "more than what it finds. It never flags two people already related",
          "to each other, because a father and son with the same name is the",
          "single commonest false alarm in genealogy. A shared surname alone",
          "is never enough. Birth years more than 2 years apart rule a pair",
          "out, and so does a recorded difference of sex. A list of weak",
          "guesses would only train you to ignore it.",
        ]),
      },
      {
        heading: "Merging two records",
        body: md([
          "Merging keeps one record and folds the other into it: relationships,",
          "tree memberships, photos and documents all move across, and where",
          "both records knew the same thing the one you are keeping wins.",
          "",
          "No photo is destroyed. Both records describe the same person, so",
          "both sets of pictures are of them and the loser's are added after",
          "the survivor's.",
          "",
          "It refuses rather than guesses when the two people are recorded as",
          "related to each other, or when merging them would leave a child",
          "with three parents.",
        ]),
      },
    ],
  },

  {
    id: "not-yet",
    title: "What this app doesn't do",
    summary: "Deliberate absences, and the reasoning behind them.",
    sections: [
      {
        heading: "No account, no sync, no sharing link",
        body: md([
          "These are not missing features waiting to be built. They would all",
          "need a server, and the moment there is a server the app stops",
          "working when the network does — which is the offline-first property",
          "the whole thing is built around.",
          "",
          "The way to move your tree to another machine is the backup file,",
          "and the way to show it to somebody is a PDF, a picture or a GEDCOM.",
        ]),
      },
      {
        heading: "No maps, and no clever guessing",
        body: md([
          "Map tiles come from the network. So does anything that would try to",
          "match your relatives against a model somewhere. Both are out for",
          "the same reason as sync.",
        ]),
      },
      {
        heading: "Not yet built",
        body: md([
          "- **Sources and citations, life events, places.** The big one. For",
          "  now, *custom fields* on a person will hold an occupation, a",
          "  birthplace or a regiment.",
          "- **GEDCOM import** and merging an imported file against what you",
          "  already have.",
          "- **“How is X related to Y”**, a timeline view, and circular",
          "  layouts.",
        ]),
      },
      {
        heading: "Your data is not encrypted",
        body: md([
          "Anyone with access to this computer and this browser profile can",
          "read your tree. Encrypting it behind a passphrase was considered",
          "and dropped: “forgot the passphrase” would mean permanent,",
          "unrecoverable loss of the whole family history, which is a worse",
          "failure than the one it prevents.",
        ]),
      },
    ],
  },
]

export interface HelpSearchResult {
  topic: HelpTopic
  // The sections that matched. Empty when the topic's own title or summary is
  // what matched, in which case the whole topic is the answer rather than one
  // part of it.
  sections: HelpSection[]
}

function haystack(text: string): string {
  return text.toLowerCase()
}

function sectionText(section: HelpSection): string {
  return haystack(
    [
      section.heading,
      section.body,
      ...(section.shortcuts ?? []).flatMap((shortcut) => [
        shortcut.keys,
        shortcut.description,
      ]),
    ].join(" ")
  )
}

// Every term has to appear somewhere in the topic, which is what somebody
// typing two words into a documentation search means by it. Ranked so a topic
// whose title matches comes before one that merely mentions the words, because
// "backup" should find the backup page rather than the eight pages that
// reference it.
export function searchHelp(
  query: string,
  topics: HelpTopic[] = HELP_TOPICS
): HelpSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0)
    return topics.map((topic) => ({ topic, sections: [] }))

  const results: Array<HelpSearchResult & { rank: number }> = []
  for (const topic of topics) {
    const title = haystack(`${topic.title} ${topic.summary}`)
    const sections = topic.sections.map(sectionText)
    const whole = [title, ...sections].join(" ")
    if (!terms.every((term) => whole.includes(term))) continue

    const titleMatch = terms.every((term) => title.includes(term))
    const matching = topic.sections.filter((_, i) =>
      terms.every((term) => sections[i].includes(term))
    )
    results.push({
      topic,
      // A topic found by its title is offered whole. Otherwise only the
      // sections that matched are, and when the terms are spread across
      // several sections with no single one holding them all, the topic is
      // still a hit — so fall back to all of them rather than to none.
      sections: titleMatch
        ? []
        : matching.length > 0
          ? matching
          : topic.sections,
      rank: titleMatch ? 0 : 1,
    })
  }

  return results
    .sort((a, b) => a.rank - b.rank)
    .map(({ topic, sections }) => ({ topic, sections }))
}
