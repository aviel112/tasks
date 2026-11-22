#!/bin/zsh
# 22.11.26 (אביאל: "המון באגים, תלמד שזה לא יקרה לי שוב"). הדרך היחידה לאתחל את העוזרת אחרי שינוי קוד:
# 1) בדיקת תחביר לכל הקבצים  2) בדיקות הפקודות האמיתיות  3) מחכה ש-5 דקות לא כתבת לעוזרת  4) אתחול ואימות "paired"
cd "$(dirname "$0")" || exit 1
for f in *.js; do case "$f" in *.bak*|*before*) continue;; esac; node --check "$f" || { echo "שגיאת תחביר ב-$f, לא מאתחל"; exit 1; }; done
for t in tests/*.test.js; do node "$t" || { echo "בדיקה נכשלה: $t, לא מאתחל"; exit 1; }; done
waited=0
while true; do
  last=$(node -e "try{console.log(require('./last-owner-msg.json').at)}catch{console.log(0)}")
  idle=$(( ($(date +%s) * 1000 - last) / 1000 ))
  [ $idle -ge 300 ] && break
  [ $waited -ge 1800 ] && { echo "אביאל פעיל כבר 30 דקות, לא מאתחל עכשיו"; exit 2; }
  echo "אביאל כתב לפני $idle שניות, מחכה..."; sleep 30; waited=$((waited + 30))
done
L0=$(wc -l < assistant.log | tr -d ' ')
launchctl kickstart -k gui/$(id -u)/com.aviel.whatsapp-assistant
for i in {1..12}; do sleep 10; sed -n "${L0},\$p" assistant.log | grep -qa "\[status\] paired" && { echo "עלה ומחובר"; sed -n "${L0},\$p" assistant.log | grep -a "\[recover\]" ; exit 0; }; done
echo "לא התחבר תוך 2 דקות — לבדוק assistant.log"; exit 3
