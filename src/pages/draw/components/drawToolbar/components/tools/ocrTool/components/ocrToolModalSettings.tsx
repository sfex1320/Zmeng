import { ModalForm } from "@ant-design/pro-form";
import { Button } from "antd";
import { FormattedMessage, useIntl } from "react-intl";
import { ZmengSettingsIcon } from "@/components/zmengIcons";
import { TranslationConfig } from "@/pages/settings/functionSettings/components/translationConfig";
import { ToolbarTooltip } from "../../../toolbarTooltip";

export const OcrToolModalSettings: React.FC<{
	onFinish: () => Promise<void>;
}> = ({ onFinish }) => {
	const intl = useIntl();
	const title = intl.formatMessage({ id: "draw.ocrToolModalSettings.title" });

	return (
		<ModalForm
			title={<FormattedMessage id="draw.ocrToolModalSettings.title" />}
			trigger={
				<ToolbarTooltip title={title}>
					<Button
						icon={<ZmengSettingsIcon />}
						aria-label={title}
						key="ocrToolModalSettings"
						type="text"
					/>
				</ToolbarTooltip>
			}
			onFinish={async () => {
				await onFinish();
				return true;
			}}
			modalProps={{
				centered: true,
				forceRender: false,
			}}
		>
			{/* <GroupTitle id="translationSettings">
				<FormattedMessage id="settings.functionSettings.translationSettings" />
			</GroupTitle> */}
			<TranslationConfig />
		</ModalForm>
	);
};
