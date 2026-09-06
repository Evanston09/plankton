# Run from the repository root: vhs demo.tape
# Entirely simulated: the shell function below replaces plankton for this tape.
# No CLI installation, credentials, network access, or Planka instance is used.
# Output is illustrative, with fictional robotics data.
Output docs/demo.gif

Require bash
Set Shell bash
Set Width 1400
Set Height 800
Set FontSize 22
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 35ms

Hide
Type `export PS1='$ '; unset PROMPT_COMMAND; set +o history`
Enter
Type `function plankton() { case "$*" in 'boards list') printf '%s\n' 'ID   Name   Project' '10   Robot  Robotics';; 'cards find --board Robot --query intake') printf '%s\n' 'ID   Name                 Board  List' '123  Tune intake rollers  Robot  Todo';; 'cards move 123 --list In Progress') printf '%s\n' 'ID:       123' 'Name:     Tune intake rollers' 'Board ID: 10' 'List ID:  21' 'URL:      https://planka.example/boards/10/cards/123';; 'checklists create --card 123 --name Validation') printf '%s\n' 'ID:       456' 'Name:     Validation' 'Card ID:  123';; 'tasks add --card 123 --checklist Validation --name Bench test') printf '%s\n' 'ID:           789' 'Name:         Bench test' 'Task list ID: 456' 'Is completed: false';; 'tasks complete 789 --json') printf '%s\n' '{' '  "ok": true,' '  "data": {' '    "item": {' '      "id": "789",' '      "name": "Bench test",' '      "taskListId": "456",' '      "isCompleted": true' '    }' '  }' '}';; *) printf '%s\n' 'This recording only supports its scripted mock commands.' >&2; return 1;; esac; }`
Enter
Type "clear"
Enter
Sleep 500ms
Show

Type "# Plankton — robotics tasks from your terminal"
Enter
Type "# Demo with fictional data and simulated responses"
Enter
Sleep 1s
Type "plankton boards list"
Enter
Sleep 2s
Type "plankton cards find --board Robot --query intake"
Enter
Sleep 3s

Hide
Type "clear"
Enter
Show
Type "# Move work forward and add a validation checklist"
Enter
Type 'plankton cards move 123 --list "In Progress"'
Enter
Sleep 2s
Type "plankton checklists create --card 123 --name Validation"
Enter
Sleep 2s
Type 'plankton tasks add --card 123 --checklist Validation --name "Bench test"'
Enter
Sleep 3s

Hide
Type "clear"
Enter
Show
Type "# Structured results for agents and scripts"
Enter
Type "plankton tasks complete 789 --json"
Enter
Sleep 4s
