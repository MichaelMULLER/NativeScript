import { ShownModallyData } from "tns-core-modules/ui/page";
import { Button } from "tns-core-modules/ui/button";
import { Label } from "tns-core-modules/ui/label";
import { Page } from "tns-core-modules/ui/page";

let closeCallback: Function;

export function onShownModally(args: ShownModallyData) {
    closeCallback = args.closeCallback;
}

export function onTap() {
    closeCallback("sample text\n");
}

export function change(args) {
    var button: Button = <Button>args.object;

    var page: Page = <Page>button.parent;

    console.log("---------------------page-------------------------");
    console.log(page);
    var label: Label = <Label>page.getViewById("label1");
    label.text = "fooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo";

    var label2: Label = <Label>page.getViewById("label2");
    label2.text = "foooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo";
}